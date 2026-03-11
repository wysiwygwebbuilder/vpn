import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert, TextInput, Modal, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RefreshCw, ShieldCheck, Plus, Power, Wifi, ChevronLeft, Link as LinkIcon, FileText, Check, Square, Flame, Copy } from 'lucide-react-native';
import axios from 'axios';
import * as Clipboard from 'expo-clipboard';
import { Buffer } from 'buffer';
import { SUBSCRIPTION_URLS, dedupeServers, parseVlessLink, VlessConfig, extractVlessLinks, sortServers, supportsNativeTunnel } from '../src/utils/vless';
import { ServerGroupCard } from '../src/components/ServerGroupCard';
import { vpnService } from '../src/services/vpnService';
import { storageService } from '../src/services/storage';
interface CustomList {
  id: string;
  name: string;
  content: string;
  servers: VlessConfig[];
  lastUpdated: number;
}

const MAX_PUBLIC_SERVERS = 100;
const MAX_PINGED_PUBLIC_SERVERS = 24;
const PUBLIC_PING_BATCH_SIZE = 2; // Reduced from 6 to prevent UI blocking
const PING_BATCH_DELAY_MS = 200; // Delay between ping batches
const CONNECT_RETRY_ATTEMPTS = 3;
const CONNECT_RETRY_DELAY_MS = 1200;
const CONNECT_READY_TIMEOUT_MS = 10000;
const CONNECT_READY_POLL_MS = 400;
const MAX_CONNECT_CANDIDATES = 5;

const mergeServerPings = (servers: VlessConfig[], pingedServers: VlessConfig[]) => {
  const pingMap = new Map(pingedServers.map((server) => [server.id, server.ping]));
  return servers.map((server) =>
    pingMap.has(server.id) ? { ...server, ping: pingMap.get(server.id) ?? server.ping } : server
  );
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForTruthy = async (
  check: () => Promise<boolean>,
  timeoutMs: number,
  pollMs: number
) => {
  const deadlineAt = Date.now() + timeoutMs;
  while (Date.now() < deadlineAt) {
    if (await check()) {
      return true;
    }
    await sleep(pollMs);
  }
  return false;
};

const buildConnectionCandidatePool = (primary: VlessConfig, pool: VlessConfig[]): VlessConfig[] => {
  const uniqueServers = dedupeServers([primary, ...pool]).filter((server) => supportsNativeTunnel(server));
  const fallbacks = sortServers(uniqueServers.filter((server) => server.id !== primary.id));
  return [primary, ...fallbacks].slice(0, MAX_CONNECT_CANDIDATES);
};

export default function Index() {
  // Data State
  const [publicServers, setPublicServers] = useState<VlessConfig[]>([]);
  const [customLists, setCustomLists] = useState<CustomList[]>([]);

  // UI State
  const [loadingPublic, setLoadingPublic] = useState(false);
  const [connectedServer, setConnectedServer] = useState<VlessConfig | null>(null);
  const [connectingServerId, setConnectingServerId] = useState<string | null>(null);
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [nativeDebug, setNativeDebug] = useState<string>('');
  const [nativeError, setNativeError] = useState<string>('');

  // Ping State
  const [pingingListId, setPingingListId] = useState<string | null>(null);
  const [pingProgress, setPingProgress] = useState<{ current: number; total: number } | null>(null);
  const shouldStopPing = useRef(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [newListName, setNewListName] = useState('');
  const [newListContent, setNewListContent] = useState('');
  const [addMethod, setAddMethod] = useState<'url' | 'text'>('url');
  const [previewServers, setPreviewServers] = useState<VlessConfig[]>([]);

  // Server Edit Modal State
  const [isServerModalOpen, setIsServerModalOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<VlessConfig | null>(null);
  const [editingServerListId, setEditingServerListId] = useState<string | null>(null);
  const [editedServerContent, setEditedServerContent] = useState('');

  // Ref to track the latest connection attempt
  const connectionAttemptRef = useRef<string | null>(null);
  const publicFetchInFlightRef = useRef(false);
  const publicFetchRequestRef = useRef(0);
  const vpnActivityRef = useRef<'disconnected' | 'connecting' | 'connected'>('disconnected');

  const getNativeVpnUnavailableMessage = () =>
    Platform.OS === 'web'
      ? 'Веб-версия не может запускать VLESS-подключения. Нужна Android-сборка для работы приложения.'
      : 'В этой Android-сборке недоступен нативный VPN-модуль для VLESS-подключений.';

  const hydrateNativeDiagnostics = async () => {
    if (!vpnService.isNativeVpnAvailable()) {
      setNativeDebug('');
      setNativeError('');
      return { debug: '', error: '' };
    }

    try {
      const stats = await vpnService.getTrafficStats();
      let debug = stats.debug || '';
      let error = stats.error || '';
      
      // Используем диагностическую информацию из нативного кода
      const diagnosticStatus = stats.diagnostic_status || '';
      const diagnosticDetails = stats.diagnostic_details || '';
      const isRunning = stats.running || false;
      const isConnected = stats.connected || false;
      const engine = stats.engine || 'none';
      
      // Если есть диагностическая информация, используем её
      if (diagnosticStatus && diagnosticDetails) {
        if (diagnosticStatus === 'dns_error') {
          error = `Ошибка DNS (${engine}): ${diagnosticDetails}`;
        } else if (diagnosticStatus === 'connection_failed') {
          error = `Ошибка подключения (${engine}): ${diagnosticDetails}`;
        } else if (diagnosticStatus === 'error') {
          error = `Ошибка (${engine}): ${diagnosticDetails}`;
        } else if (diagnosticStatus === 'tunnel_not_established') {
          error = `Туннель не установлен: ${diagnosticDetails}`;
        } else if (diagnosticStatus === 'connected') {
          debug = `Успешно подключен (${engine}): ${diagnosticDetails}`;
        }
      }
      
      // Если нет ошибки из диагностики, но есть общая ошибка
      if (!error && stats.error) {
        error = stats.error;
      }
      
      // Если нет дебага из диагностики, но есть общий дебаг
      if (!debug && stats.debug) {
        debug = stats.debug;
      }
      
      // Добавляем информацию о состоянии
      const statusInfo = `Состояние: ${isRunning ? 'запущен' : 'остановлен'}, ` +
                        `Подключение: ${isConnected ? 'установлено' : 'не установлено'}, ` +
                        `Движок: ${engine}`;
      
      if (!debug) {
        debug = statusInfo;
      } else {
        debug = `${statusInfo} | ${debug}`;
      }
      
      // Добавляем timestamp для отладки
      const timestamp = new Date().toLocaleTimeString();
      if (debug) {
        debug = `[${timestamp}] ${debug}`;
      }
      if (error) {
        error = `[${timestamp}] ${error}`;
      }
      
      setNativeDebug(debug);
      setNativeError(error);
      return { debug, error };
    } catch (err: any) {
      const errorMsg = err?.message || 'Неизвестная ошибка диагностики';
      setNativeDebug('');
      setNativeError(`Ошибка получения диагностики: ${errorMsg}`);
      return { debug: '', error: errorMsg };
    }
  };

  useEffect(() => {
    vpnActivityRef.current = status;
  }, [status]);

  const canProbeServers = () =>
    vpnService.isNativeVpnAvailable() && vpnActivityRef.current === 'disconnected';

  // Load Data from Storage on mount
  useEffect(() => {
    const loadData = async () => {
      const savedLists = await storageService.getItem('custom_lists');
      if (savedLists) {
        try {
          const parsedLists = JSON.parse(savedLists).map((list: CustomList) => ({
            ...list,
            servers: (list.servers ?? []).filter((server: VlessConfig) => supportsNativeTunnel(server)),
          }));
          setCustomLists(parsedLists);
        } catch (e) {
          console.error("Failed to load custom lists", e);
        }
      }

      const savedPublic = await storageService.getItem('public_servers');
      if (savedPublic) {
        try {
          const parsed = JSON.parse(savedPublic).filter((server: VlessConfig) => supportsNativeTunnel(server));
          if (parsed.length > 0) {
            setPublicServers(parsed);
          }
          fetchPublicServers(true);
        } catch (e) {
          console.error("Failed to load public servers", e);
          fetchPublicServers(false);
        }
      } else {
        fetchPublicServers(false);
      }
    };

    loadData();

    const interval = setInterval(() => {
      fetchPublicServers(true);
    }, 3600000);

    return () => clearInterval(interval);
  }, []);

  // Persist Data
  useEffect(() => {
    storageService.setItem('custom_lists', JSON.stringify(customLists));
  }, [customLists]);

  useEffect(() => {
    storageService.setItem('public_servers', JSON.stringify(publicServers));
  }, [publicServers]);

  useEffect(() => {
    if (status !== 'connected' || !vpnService.isNativeVpnAvailable()) {
      if (status !== 'connected') {
        setNativeDebug('');
        setNativeError('');
      }
      return;
    }

    void hydrateNativeDiagnostics();
    const interval = setInterval(() => {
      void hydrateNativeDiagnostics();
    }, 3000);

    return () => clearInterval(interval);
  }, [status]);

  const fetchPublicServers = async (isBackground = false) => {
    if (publicFetchInFlightRef.current) {
      return;
    }

    publicFetchInFlightRef.current = true;
    const requestId = ++publicFetchRequestRef.current;
    const cachedPublicServers = [...publicServers];
    let lastLoadError: string | null = null;

    if (!isBackground) setLoadingPublic(true);
    
    const allServers: VlessConfig[] = [];
    const seenIds = new Set<string>();
    
    try {
      for (let i = 0; i < SUBSCRIPTION_URLS.length; i++) {
        const url = SUBSCRIPTION_URLS[i];
        const isPriority = i < 2;
        
        try {
          const response = await axios.get(url, { 
            timeout: 20000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36',
              'Accept': '*/*',
              'Accept-Encoding': 'gzip, deflate',
              'Connection': 'keep-alive',
            },
            validateStatus: (status) => status >= 200 && status < 300,
          });

          if (!response.data) {
            continue;
          }

          let data = response.data;
          if (typeof data !== 'string') data = JSON.stringify(data);
          
          try {
            const trimmed = data.trim();
            if (/^[A-Za-z0-9+/=\r\n]+$/.test(trimmed) && trimmed.length > 20) {
              const decoded = Buffer.from(trimmed.replace(/\s+/g, ''), 'base64').toString('utf-8');
              if (decoded.includes('vless://')) data = decoded;
            }
          } catch (e) {}

          const lines = data.split(/[\r\n]+/);
          const vlessLinks = lines.filter((l: string) => l.trim().startsWith('vless://'));
          
          const parsed = vlessLinks
            .map(parseVlessLink)
            .filter((server: VlessConfig | null): server is VlessConfig => {
              if (!server || !supportsNativeTunnel(server) || seenIds.has(server.id)) return false;
              seenIds.add(server.id);
              return true;
            });

          allServers.push(...parsed);

          if (publicFetchRequestRef.current !== requestId) {
            return;
          }

          if (isPriority && i === 0 && allServers.length >= 10 && canProbeServers()) {
            const firstBatch = allServers.slice(0, 10);
            const checkedServers = await Promise.all(
              firstBatch.map(async (server) => {
                const ping = await vpnService.checkConnectivity(server);
                return { ...server, ping };
              })
            );
            
            const available = checkedServers.filter(s => s.ping > 0);
            
            if (available.length >= 5) {
              const top5 = available.slice(0, 5);
              const rest = checkedServers.filter(s => !top5.some(t => t.id === s.id));
              setPublicServers(sortServers([...top5, ...rest]));
            } else {
              setPublicServers(sortServers(checkedServers));
            }
          } else if (allServers.length > 0) {
            const cachedPingMap = new Map(publicServers.map((s) => [s.id, s.ping]));
            const staged = allServers.map((s) => ({
              ...s,
              ping: cachedPingMap.get(s.id) ?? s.ping,
            }));
            setPublicServers(sortServers(staged.slice(0, MAX_PUBLIC_SERVERS)));
          }

          if (isPriority && allServers.length >= MAX_PUBLIC_SERVERS) {
            break;
          }
        } catch (error: any) {
          const errorMsg = error.response?.status 
            ? `HTTP ${error.response.status}` 
            : error.code || error.message || 'Unknown error';
          lastLoadError = errorMsg;
        }
      }

      if (allServers.length === 0) {
        if (cachedPublicServers.length > 0) {
          setConnectionError(
            lastLoadError
              ? `Не удалось обновить списки: ${lastLoadError}. Оставлен сохраненный кэш.`
              : 'Не удалось обновить списки. Оставлен сохраненный кэш.'
          );
          return;
        }

        const fallback1 = parseVlessLink('vless://d342d11b-d424-4b70-aa40-18753796c887@104.21.48.84:443?encryption=none&security=tls&sni=telegram.org&type=ws&host=telegram.org&path=%2F#Fallback_1');
        const fallback2 = parseVlessLink('vless://d342d11b-d424-4b70-aa40-18753796c887@1.1.1.1:443?encryption=none&security=tls&sni=cloudflare.com&type=ws&host=cloudflare.com&path=%2F#Fallback_2');
        const fallback3 = parseVlessLink('vless://d342d11b-d424-4b70-aa40-18753796c887@8.8.8.8:443?encryption=none&security=tls&sni=google.com&type=ws&host=google.com&path=%2F#Fallback_3');
        
        if (fallback1) allServers.push(fallback1);
        if (fallback2) allServers.push(fallback2);
        if (fallback3) allServers.push(fallback3);
        
        setConnectionError('Не удалось загрузить списки. Используются резервные серверы.');
      }

      if (publicFetchRequestRef.current !== requestId) {
        return;
      }

      const cachedPingMap = new Map(cachedPublicServers.map((s) => [s.id, s.ping]));
      const finalServers = allServers.slice(0, MAX_PUBLIC_SERVERS).map((s) => ({
        ...s,
        ping: cachedPingMap.get(s.id) ?? s.ping,
      }));

      setPublicServers(sortServers(finalServers));
      setConnectionError(null);

      if (!canProbeServers()) {
        return;
      }

      const alreadyPinged = new Set(cachedPublicServers.filter(s => s.ping !== 0).map(s => s.id));
      const pingCandidates = finalServers
        .filter(s => !alreadyPinged.has(s.id))
        .slice(0, MAX_PINGED_PUBLIC_SERVERS);
      
      let pingedServers: VlessConfig[] = [];

      for (let index = 0; index < pingCandidates.length; index += PUBLIC_PING_BATCH_SIZE) {
        if (!canProbeServers()) {
          return;
        }

        const batch = pingCandidates.slice(index, index + PUBLIC_PING_BATCH_SIZE);
        
        // Process pings sequentially within batch to prevent UI blocking
        const batchResults: VlessConfig[] = [];
        for (const server of batch) {
          if (!canProbeServers()) {
            return;
          }
          
          try {
            const ping = await vpnService.checkConnectivity(server);
            batchResults.push({ ...server, ping });
            
            // Update progress after each ping
            if (publicFetchRequestRef.current === requestId) {
              const currentPinged = [...pingedServers, ...batchResults];
              setPublicServers(sortServers(mergeServerPings(finalServers, currentPinged)));
            }
            
            // Small delay between pings to keep UI responsive
            await new Promise(resolve => setTimeout(resolve, 50));
          } catch (error) {
            console.warn(`Failed to ping server ${server.name}:`, error);
            batchResults.push({ ...server, ping: -1 });
          }
        }

        pingedServers = [...pingedServers, ...batchResults];

        if (publicFetchRequestRef.current !== requestId) {
          return;
        }

        setPublicServers(sortServers(mergeServerPings(finalServers, pingedServers)));
        
        // Add delay between batches to keep UI responsive
        if (index + PUBLIC_PING_BATCH_SIZE < pingCandidates.length) {
          await new Promise(resolve => setTimeout(resolve, PING_BATCH_DELAY_MS));
        }
      }
    } catch (error: any) {
      setConnectionError('Критическая ошибка загрузки серверов');
    } finally {
      publicFetchInFlightRef.current = false;
      if (!isBackground && publicFetchRequestRef.current === requestId) {
        setLoadingPublic(false);
      }
    }
  };

  const updateServerPing = (listId: string, serverId: string, ping: number) => {
    if (listId === 'default') {
      setPublicServers(prev => prev.map(s => s.id === serverId ? { ...s, ping } : s));
    } else {
      setCustomLists(prev => prev.map(list => {
        if (list.id === listId) {
          return {
            ...list,
            servers: list.servers.map(s => s.id === serverId ? { ...s, ping } : s)
          };
        }
        return list;
      }));
    }
  };

  const handlePingServer = async (server: VlessConfig, listId: string) => {
    if (!canProbeServers()) {
      return;
    }

    updateServerPing(listId, server.id, -999);
    const newPing = await vpnService.checkConnectivity(server, 'deep');
    updateServerPing(listId, server.id, newPing);
  };

  const handleStopPing = () => {
    shouldStopPing.current = true;
  };

  const handlePingAll = async (listId: string) => {
    if (pingingListId || !canProbeServers()) return;

    shouldStopPing.current = false;
    setPingingListId(listId);

    let serversToPing: VlessConfig[] = [];

    if (listId === 'default') {
      serversToPing = [...publicServers];
    } else {
      const list = customLists.find(l => l.id === listId);
      if (list) serversToPing = [...list.servers];
    }

    if (serversToPing.length === 0) {
      setPingingListId(null);
      return;
    }

    setPingProgress({ current: 0, total: serversToPing.length });

    for (let i = 0; i < serversToPing.length; i++) {
      if (shouldStopPing.current) {
        break;
      }

      const server = serversToPing[i];
      updateServerPing(listId, server.id, -999);
      const ping = await vpnService.checkConnectivity(server, 'deep');
      updateServerPing(listId, server.id, ping);
      setPingProgress(prev => prev ? { ...prev, current: i + 1 } : null);
    }

    setPingingListId(null);
    setPingProgress(null);
  };

  const findServerListId = (serverId: string) => {
    if (publicServers.some((server) => server.id === serverId)) {
      return 'default';
    }

    const customList = customLists.find((list) => list.servers.some((server) => server.id === serverId));
    return customList?.id ?? null;
  };

  const handleOpenEditServer = (server: VlessConfig, listId: string) => {
    setEditingServer(server);
    setEditingServerListId(listId);
    setEditedServerContent(server.raw);
    setIsServerModalOpen(true);
  };

  const handleSaveServer = () => {
    if (!editingServer || !editingServerListId) return;

    const parsed = parseVlessLink(editedServerContent);
    if (!parsed) {
      Alert.alert('Некорректная ссылка VLESS');
      return;
    }

    if (!supportsNativeTunnel(parsed)) {
      Alert.alert('Этот тип сервера пока не поддерживается в Android-сборке');
      return;
    }

    const isSameHost = parsed.host === editingServer.host && parsed.port === editingServer.port;
    const updatedServer = {
      ...parsed,
      ping: isSameHost ? editingServer.ping : -1
    };

    if (editingServerListId === 'default') {
      setPublicServers(prev => prev.map(s => s.id === editingServer.id ? updatedServer : s));
    } else {
      setCustomLists(prev => prev.map(list => {
        if (list.id === editingServerListId) {
          return {
            ...list,
            servers: list.servers.map(s => s.id === editingServer.id ? updatedServer : s)
          };
        }
        return list;
      }));
    }
    setIsServerModalOpen(false);
    setEditingServer(null);
    setEditingServerListId(null);
  };

  const runConnectionAttempt = async (server: VlessConfig, attemptId: string) => {
    let diagnostics = { debug: '', error: '' };
    let lastConnectionError = '';

    setConnectingServerId(server.id);

    for (let attempt = 1; attempt <= CONNECT_RETRY_ATTEMPTS; attempt += 1) {
      if (connectionAttemptRef.current !== attemptId) {
        return { connected: false, cancelled: true, diagnostics };
      }

      // Обновляем статус для пользователя
      setNativeDebug(`Попытка подключения ${attempt}/${CONNECT_RETRY_ATTEMPTS}...`);

      if (attempt > 1) {
        await vpnService.disconnect();
        await sleep(CONNECT_RETRY_DELAY_MS);
      }

      const connected = await vpnService.connect(server);
      if (!connected) {
        diagnostics = await hydrateNativeDiagnostics();
        lastConnectionError = diagnostics.error || diagnostics.debug || 'Неизвестная ошибка подключения';
        setNativeError(`Попытка ${attempt} не удалась: ${lastConnectionError}`);
        await vpnService.disconnect();
        continue;
      }

      // Ждем подтверждения что подключение действительно работает
      setNativeDebug(`Проверка подключения (попытка ${attempt})...`);
      const stillConnected = await waitForTruthy(
        () => vpnService.isConnected(),
        CONNECT_READY_TIMEOUT_MS,
        CONNECT_READY_POLL_MS
      );
      diagnostics = await hydrateNativeDiagnostics();

      if (stillConnected) {
        // Дополнительная проверка - получаем полную диагностику
        const fullStats = await vpnService.getTrafficStats();
        const diagnosticStatus = fullStats.diagnostic_status || '';
        const diagnosticDetails = fullStats.diagnostic_details || '';
        
        // Проверяем критические ошибки
        if (diagnosticStatus === 'dns_error' || 
            diagnosticStatus === 'connection_failed' || 
            diagnosticStatus === 'error' ||
            diagnosticStatus === 'tunnel_not_established') {
          
          setNativeError(`Обнаружена проблема (${diagnosticStatus}): ${diagnosticDetails}`);
          await vpnService.disconnect();
          continue;
        }
        
        // Проверяем обычные ошибки
        if (fullStats.error && (
            fullStats.error.includes('direct dns') ||
            fullStats.error.includes('failed') ||
            fullStats.error.includes('error'))) {
          
          setNativeError(`Обнаружена проблема: ${fullStats.error}`);
          await vpnService.disconnect();
          continue;
        }
        
        // Если диагностика показывает что всё ок
        if (diagnosticStatus === 'connected' || 
            (fullStats.connected && !fullStats.error)) {
          
          setNativeDebug(`Подключение успешно установлено (попытка ${attempt}, ${fullStats.engine})`);
          return { connected: true, cancelled: false, diagnostics };
        }
        
        // Если статус неясный, считаем что подключение не удалось
        setNativeError(`Неясный статус подключения: ${diagnosticStatus} - ${diagnosticDetails}`);
        await vpnService.disconnect();
        continue;
      }

      // Если подключение не подтвердилось
      diagnostics = await hydrateNativeDiagnostics();
      lastConnectionError = diagnostics.error || diagnostics.debug || 'Подключение не подтвердилось';
      setNativeError(`Подключение не подтвердилось (попытка ${attempt}): ${lastConnectionError}`);
      await vpnService.disconnect();
    }

    // Все попытки исчерпаны
    setNativeError(`Не удалось подключиться после ${CONNECT_RETRY_ATTEMPTS} попыток. Последняя ошибка: ${lastConnectionError}`);
    return { connected: false, cancelled: false, diagnostics };
  };
  const handleConnect = async (server: VlessConfig) => {
    if (status === 'connecting' && connectingServerId === server.id) {
      return;
    }

    setConnectionError(null);
    setNativeDebug('');
    setNativeError('');

    if (connectedServer?.id === server.id) {
      await vpnService.disconnect();
      await new Promise(resolve => setTimeout(resolve, 500));
      setStatus('disconnected');
      setConnectedServer(null);
      setConnectingServerId(null);
      setNativeDebug('');
      setNativeError('');
      return;
    }

    if (!supportsNativeTunnel(server)) {
      setStatus('disconnected');
      setConnectedServer(null);
      setConnectingServerId(null);
      setConnectionError('Этот тип VLESS-сервера пока не поддерживается в Android-сборке.');
      return;
    }

    const attemptId = Date.now().toString();
    connectionAttemptRef.current = attemptId;
    setConnectingServerId(server.id);
    setStatus('connecting');

    if (!vpnService.isNativeVpnAvailable()) {
      setStatus('disconnected');
      setConnectedServer(null);
      setConnectingServerId(null);
      setConnectionError(getNativeVpnUnavailableMessage());
      return;
    }

    if (connectionAttemptRef.current !== attemptId) {
      return;
    }

    try {
      if (connectedServer && connectedServer.id !== server.id) {
        await vpnService.disconnect();
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      const currentListId = findServerListId(server.id);
      const currentListServers = currentListId === 'default'
        ? publicServers
        : customLists.find((list) => list.id === currentListId)?.servers ?? [];
      const allKnownServers = dedupeServers([
        ...currentListServers,
        ...publicServers,
        ...customLists.flatMap((list) => list.servers),
      ]);
      const connectionCandidates = buildConnectionCandidatePool(server, allKnownServers);
      const attemptedCandidates: string[] = [];
      let diagnostics = { debug: '', error: '' };

      for (const candidate of connectionCandidates) {
        if (connectionAttemptRef.current !== attemptId) {
          return;
        }

        attemptedCandidates.push(candidate.name);
        const result = await runConnectionAttempt(candidate, attemptId);
        diagnostics = result.diagnostics;

        if (result.cancelled) {
          return;
        }

        if (result.connected) {
          setConnectedServer(candidate);
          setConnectingServerId(null);
          setStatus('connected');
          setConnectionError(
            candidate.id === server.id
              ? null
              : `Основной сервер недоступен, подключен резерв ${candidate.name}.`
          );
          return;
        }

        const candidateListId = findServerListId(candidate.id);
        if (candidateListId) {
          updateServerPing(candidateListId, candidate.id, -1);
        }
      }

      await vpnService.disconnect();
      await new Promise(resolve => setTimeout(resolve, 500));
      setStatus('disconnected');
      setConnectedServer(null);
      setConnectingServerId(null);
      setConnectionError(
        diagnostics.error ||
          diagnostics.debug ||
          `Не удалось подключиться. Попробованы серверы: ${attemptedCandidates.join(', ')}.`
      );
    } catch (error) {
      console.error('Failed to connect server', error);
      await vpnService.disconnect();
      await new Promise(resolve => setTimeout(resolve, 500));
      setStatus('disconnected');
      setConnectedServer(null);
      setConnectingServerId(null);
      setConnectionError('Ошибка подключения или разрешения');
    }
  };

  const handleMainButton = () => {
    if (status === 'connecting') {
      return;
    }

    if (connectedServer) {
      handleConnect(connectedServer);
      return;
    }

    const allServers = [...publicServers, ...customLists.flatMap((list) => list.servers)];
    const best = sortServers(allServers).find((server) => server.ping !== -1);
    if (best) {
      handleConnect(best);
    }
  };

  const connectionTargetName =
    status === 'connecting'
      ? [...publicServers, ...customLists.flatMap((list) => list.servers)].find((server) => server.id === connectingServerId)?.name ?? 'выбранный сервер'
      : connectedServer?.name ?? null;


  const statusMessage =
    status === 'connected' && connectedServer
      ? nativeError || nativeDebug || `Активен сервер ${connectedServer.name}`
      : status === 'connecting'
        ? nativeError || nativeDebug || `Подключаем ${connectionTargetName}...`
        : nativeError || connectionError || nativeDebug || '';

  const statusDetails = Array.from(
    new Set(
      [connectionError?.trim(), nativeError?.trim(), nativeDebug?.trim()].filter(
        (value): value is string => Boolean(value)
      )
    )
  ).join('\n');

  const handleCopyStatusDetails = async () => {
    if (!statusDetails) {
      return;
    }

    await Clipboard.setStringAsync(statusDetails);
    Alert.alert('Диагностика скопирована');
  };

  const showInitialPublicLoader = loadingPublic && publicServers.length === 0;
  const showPublicRefreshNotice = loadingPublic && publicServers.length > 0;
  const showInitialPublicError = !loadingPublic && publicServers.length === 0 && Boolean(connectionError);

  const openAddModal = () => {
    setEditingListId(null);
    setNewListName('');
    setNewListContent('');
    setAddMethod('url');
    setIsModalOpen(true);
  };

  const openEditModal = (list: CustomList) => {
    setEditingListId(list.id);
    setNewListName(list.name);
    setNewListContent(list.content);
    setAddMethod('text');
    setIsModalOpen(true);
  };

  const handleSaveList = async () => {
    if (!newListName) return;

    let contentToSave = newListContent;
    let servers = previewServers;

    if (addMethod === 'url' && newListContent.startsWith('http')) {
      try {
        const res = await axios.get(newListContent, { timeout: 12000 });
        let data = res.data;
        if (typeof data !== 'string') data = JSON.stringify(data);

        try {
          const trimmed = data.trim();
          if (/^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length % 4 === 0) {
            const decoded = Buffer.from(trimmed, 'base64').toString('utf-8');
            if (decoded.includes('vless://')) data = decoded;
          }
        } catch (e) {}

        const links = extractVlessLinks(data);
        const parsed = links
          .map(parseVlessLink)
          .filter((server: VlessConfig | null): server is VlessConfig => Boolean(server && supportsNativeTunnel(server)));
        if (parsed.length > 0) {
          servers = parsed;
          contentToSave = data;
        }
      } catch (e) {
        console.error('Failed to fetch URL', e);
        Alert.alert('Не удалось загрузить список по URL');
        return;
      }
    }

    if (editingListId) {
      setCustomLists(prev => prev.map(l =>
        l.id === editingListId
          ? { ...l, name: newListName, content: contentToSave, servers, lastUpdated: Date.now() }
          : l
      ));
    } else {
      const newList: CustomList = {
        id: Date.now().toString(),
        name: newListName,
        content: contentToSave,
        servers,
        lastUpdated: Date.now()
      };
      setCustomLists(prev => [...prev, newList]);
    }
    setIsModalOpen(false);
  };

  const handleDeleteList = (id: string) => {
    setCustomLists(prev => prev.filter(l => l.id !== id));
  };

  const handleRefreshList = async (listId: string, content: string) => {
    const links = extractVlessLinks(content);
    const parsed = links
      .map(parseVlessLink)
      .filter((server: VlessConfig | null): server is VlessConfig => Boolean(server && supportsNativeTunnel(server)));
    const shouldProbe = canProbeServers();

    if (shouldProbe) {
      setPingingListId(listId);
    }

    try {
      const existingPingMap = new Map(
        (customLists.find(l => l.id === listId)?.servers ?? []).map(server => [server.id, server.ping])
      );

      const pinged = shouldProbe
        ? await (async () => {
            const results: VlessConfig[] = [];
            for (const server of parsed) {
              const ping = await vpnService.checkConnectivity(server, 'deep');
              results.push({ ...server, ping });
            }
            return results;
          })()
        : parsed.map((s) => ({
            ...s,
            ping: existingPingMap.get(s.id) ?? s.ping,
          }));

      const sorted = pinged.sort((a, b) => {
        if (a.ping === -1) return 1;
        if (b.ping === -1) return -1;
        return a.ping - b.ping;
      });

      setCustomLists(prev => prev.map(l =>
        l.id === listId ? { ...l, servers: sorted, lastUpdated: Date.now() } : l
      ));
    } finally {
      if (shouldProbe) {
        setPingingListId(null);
      }
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="flex-1 flex-col">
        <View className="px-6 pt-6 pb-4 flex-row justify-between items-center bg-white">
          <View className="flex-row items-center gap-3">
            <View className="bg-orange-100 p-2 rounded-lg">
              <Flame size={16} color="#ea580c" />
            </View>
            <View>
              <Text className="text-xl font-bold text-gray-900 leading-none">{'Феникс'}</Text>
              <Text className="text-[10px] text-gray-400 font-medium tracking-wide mt-1">
                {'Свобода от ограничений'}
              </Text>
            </View>
          </View>
          <View className="flex-row gap-2">
            <TouchableOpacity onPress={openAddModal} className="p-2 rounded-full">
              <Plus size={24} color="#9ca3af" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => fetchPublicServers(false)} className="p-2 rounded-full">
              {loadingPublic ? <ActivityIndicator size="small" color="#f97316" /> : <RefreshCw size={20} color="#9ca3af" />}
            </TouchableOpacity>
          </View>
        </View>

        <View className="px-4 mb-2">
          <View className={`rounded-lg p-4 shadow-xl h-24 overflow-hidden relative ${
            status === 'connected'
              ? 'bg-orange-500'
              : status === 'connecting'
                ? 'bg-amber-500'
                : 'bg-gray-100'
          }`}>
            <View className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl -mr-6 -mt-6 opacity-10 bg-white" />

            <View className="flex-col h-full justify-between relative z-10">
              <View className="flex-row justify-between items-start">
                <View className={`flex-row items-center gap-2 px-3 py-1 rounded-full ${
                  status === 'connected' || status === 'connecting' ? 'bg-white/20' : 'bg-white/60'
                }`}>
                  <Wifi size={12} color={status === 'connected' || status === 'connecting' ? '#ffffff' : '#4b5563'} />
                  <Text className={`text-[10px] font-bold tracking-widest uppercase ${
                    status === 'connected' || status === 'connecting' ? 'text-white/90' : 'text-gray-600'
                  }`}>
                    {'Статус'}
                  </Text>
                </View>

                {status !== 'disconnected' && (
                  <TouchableOpacity
                    onPress={handleMainButton}
                    disabled={status === 'connecting'}
                    className={`w-8 h-8 backdrop-blur-md rounded-full items-center justify-center ${
                      status === 'connecting' ? 'bg-white/10 opacity-70' : 'bg-white/20'
                    }`}
                  >
                    <Power size={16} color="#ffffff" />
                  </TouchableOpacity>
                )}
              </View>

              <View>
                <Text className={`text-lg font-semibold tracking-tight leading-none mb-1 ${
                  status === 'connected' || status === 'connecting' ? 'text-white' : 'text-gray-800'
                }`}>
                  {status === 'connected' ? 'Подключено' : status === 'connecting' ? 'Подключение' : 'Отключено'}
                </Text>
                <View className="flex-row items-start justify-between gap-2">
                  <Text
                    selectable
                    numberOfLines={3}
                    className={`flex-1 text-[10px] font-medium ${
                      status === 'connected' || status === 'connecting'
                        ? nativeError
                          ? 'text-red-100'
                          : 'text-white/80'
                        : nativeError || connectionError
                          ? 'text-red-500'
                          : nativeDebug
                            ? 'text-amber-600'
                            : 'text-gray-400'
                    }`}
                  >
                    {statusMessage}
                  </Text>
                  {statusDetails ? (
                    <TouchableOpacity
                      onPress={handleCopyStatusDetails}
                      className={`px-2 py-1 rounded-full ${
                        status === 'connected' || status === 'connecting' ? 'bg-white/15' : 'bg-gray-200'
                      }`}
                    >
                      <Copy size={12} color={status === 'connected' || status === 'connecting' ? '#ffffff' : '#4b5563'} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            </View>
          </View>
        </View>

        {showInitialPublicLoader ? (
          <View className="mx-4 mb-3 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-5">
            <View className="flex-row items-center gap-3">
              <ActivityIndicator size="small" color="#ea580c" />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-orange-900">{'Загружаем списки серверов'}</Text>
                <Text className="mt-1 text-xs text-orange-700">
                  {'Подожди немного. Если сети нет, покажем ошибку или кэш.'}
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {showPublicRefreshNotice ? (
          <View className="mx-4 mb-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
            <View className="flex-row items-center gap-3">
              <ActivityIndicator size="small" color="#2563eb" />
              <Text className="flex-1 text-xs font-medium text-blue-800">
                {'Идёт обновление списков. Текущий кэш остаётся до успешной загрузки.'}
              </Text>
            </View>
          </View>
        ) : null}

        {showInitialPublicError ? (
          <View className="mx-4 mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-4">
            <Text className="text-sm font-semibold text-red-900">{'Не удалось загрузить списки'}</Text>
            <Text selectable className="mt-1 text-xs text-red-700">
              {connectionError}
            </Text>
          </View>
        ) : null}

        <ScrollView
          className="flex-1 px-0 pb-20"
          refreshControl={
            <RefreshControl
              refreshing={loadingPublic}
              onRefresh={() => fetchPublicServers(false)}
              tintColor="#f97316"
            />
          }
        >
          <ServerGroupCard
            id="default"
            name={'Общий список'}
            servers={publicServers}
            isDefault={true}
            onConnect={handleConnect}
            onRefresh={() => fetchPublicServers(false)}
            onPingAll={() => handlePingAll('default')}
            onStopPing={handleStopPing}
            onPingServer={(server) => handlePingServer(server, 'default')}
            onEditServer={(server) => handleOpenEditServer(server, 'default')}
            connectedServerId={connectedServer?.id || null}
            connectingServerId={connectingServerId}
            isRefreshing={loadingPublic || pingingListId === 'default'}
            pingProgress={pingingListId === 'default' ? pingProgress : null}
          />

          {customLists.map((list: CustomList) => (
            <ServerGroupCard
              key={list.id}
              id={list.id}
              name={list.name}
              servers={list.servers}
              lastUpdated={list.lastUpdated}
              onConnect={handleConnect}
              onRefresh={() => handleRefreshList(list.id, list.content)}
              onPingAll={() => handlePingAll(list.id)}
              onStopPing={handleStopPing}
              onPingServer={(server: VlessConfig) => handlePingServer(server, list.id)}
              onEditServer={(server: VlessConfig) => handleOpenEditServer(server, list.id)}
              onEdit={() => openEditModal(list)}
              onDelete={() => handleDeleteList(list.id)}
              connectedServerId={connectedServer?.id || null}
              connectingServerId={connectingServerId}
              isRefreshing={pingingListId === list.id}
              pingProgress={pingingListId === list.id ? pingProgress : null}
            />
          ))}

          {customLists.length === 0 && (
            <View className="text-center py-8 items-center">
              <Text className="text-sm text-gray-400">{'Пока нет пользовательских списков.'}</Text>
              <Text className="text-xs mt-1 text-gray-400">{'Нажми +, чтобы добавить новый список.'}</Text>
            </View>
          )}
        </ScrollView>
      </View>

      <Modal visible={isModalOpen} animationType="slide" presentationStyle="fullScreen">
        <SafeAreaView className="flex-1 bg-white">
          <View className="px-6 py-4 flex-row items-center gap-4 border-b border-gray-100">
            <TouchableOpacity onPress={() => setIsModalOpen(false)} className="p-2 -ml-2 rounded-full">
              <ChevronLeft size={24} color="#6b7280" />
            </TouchableOpacity>
            <Text className="text-xl font-bold text-gray-900">{'Список серверов'}</Text>
          </View>

          <ScrollView className="flex-1 p-6">
            <Text className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
              {'Пользовательский список серверов'}
            </Text>

            <View className="space-y-4">
              <TextInput
                value={newListName}
                onChangeText={setNewListName}
                placeholder={'Название списка'}
                placeholderTextColor="#9ca3af"
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
              />

              <View className="bg-gray-100 p-1 rounded-xl flex-row">
                <TouchableOpacity
                  onPress={() => setAddMethod('url')}
                  className={clsx(
                    'flex-1 py-2 rounded-lg flex-row justify-center items-center gap-2',
                    addMethod === 'url' ? 'bg-orange-500' : ''
                  )}
                >
                  <LinkIcon size={14} color={addMethod === 'url' ? '#ffffff' : '#6b7280'} />
                  <Text className={clsx(
                    'text-sm font-bold',
                    addMethod === 'url' ? 'text-white' : 'text-gray-500'
                  )}>
                    URL
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setAddMethod('text')}
                  className={clsx(
                    'flex-1 py-2 rounded-lg flex-row justify-center items-center gap-2',
                    addMethod === 'text' ? 'bg-white' : ''
                  )}
                >
                  <FileText size={14} color={addMethod === 'text' ? '#000000' : '#6b7280'} />
                  <Text className={clsx(
                    'text-sm font-bold',
                    addMethod === 'text' ? 'text-gray-800' : 'text-gray-500'
                  )}>
                    {'Текст'}
                  </Text>
                </TouchableOpacity>
              </View>

              <TextInput
                value={newListContent}
                onChangeText={setNewListContent}
                placeholder={addMethod === 'url' ? 'URL списка серверов' : 'Вставь сюда список vless://...'}
                placeholderTextColor="#9ca3af"
                multiline={addMethod === 'text'}
                numberOfLines={addMethod === 'text' ? 8 : 1}
                className={clsx(
                  'w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm',
                  addMethod === 'text' ? 'text-gray-900 font-mono h-32' : 'text-gray-900 h-12'
                )}
              />

              <TouchableOpacity
                onPress={handleSaveList}
                disabled={!newListName || !newListContent}
                className={clsx(
                  'w-full py-3 rounded-xl flex-row justify-center items-center gap-2',
                  newListName && newListContent ? 'bg-orange-500' : 'bg-gray-100'
                )}
              >
                <Plus size={18} color={newListName && newListContent ? '#ffffff' : '#9ca3af'} />
                <Text className={clsx(
                  'font-bold',
                  newListName && newListContent ? 'text-white' : 'text-gray-400'
                )}>
                  {'Сохранить список'}
                </Text>
              </TouchableOpacity>
            </View>

            <View className="mt-12 flex-col items-center justify-center">
              <View className="w-16 h-16 bg-gray-50 rounded-full items-center justify-center mb-4">
                <View className="w-8 h-8 items-center justify-center">
                  <Text className="text-gray-300 text-2xl">+</Text>
                </View>
              </View>
              <Text className="text-gray-400 font-medium mb-1">{'Ничего не добавлено'}</Text>
              <Text className="text-xs text-gray-300 text-center">
                {'Укажи URL или вставь VLESS-ссылки из буфера'}
              </Text>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal visible={isServerModalOpen} animationType="slide" presentationStyle="fullScreen">
        <SafeAreaView className="flex-1 bg-white">
          <View className="px-6 py-4 flex-row items-center justify-between border-b border-gray-100">
            <TouchableOpacity onPress={() => setIsServerModalOpen(false)} className="p-2 -ml-2 rounded-full">
              <ChevronLeft size={24} color="#6b7280" />
            </TouchableOpacity>
            <Text className="text-xl font-bold text-gray-900">{'Редактирование сервера'}</Text>
            <View className="w-8" />
          </View>

          <ScrollView className="flex-1 p-6" contentContainerStyle={{ paddingBottom: 24 }}>
            <View>
              <Text className="text-xs font-bold text-gray-500 uppercase mb-2">
                {'Конфигурация сервера'}
              </Text>
              <TextInput
                value={editedServerContent}
                onChangeText={setEditedServerContent}
                placeholder="vless://..."
                placeholderTextColor="#9ca3af"
                multiline
                textAlignVertical="top"
                numberOfLines={16}
                className="w-full min-h-[320px] bg-gray-50 border border-gray-200 rounded-2xl px-4 py-4 text-xs font-mono text-gray-900"
              />
            </View>
          </ScrollView>

          <View className="px-6 pb-6 pt-3 border-t border-gray-100">
            <TouchableOpacity
              onPress={handleSaveServer}
              disabled={!editedServerContent}
              className={clsx(
                'w-full py-4 rounded-2xl flex-row justify-center items-center gap-2',
                editedServerContent ? 'bg-blue-600' : 'bg-gray-100'
              )}
            >
              <Text className={clsx(
                'font-bold',
                editedServerContent ? 'text-white' : 'text-gray-400'
              )}>
                {'Сохранить изменения'}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function clsx(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}
