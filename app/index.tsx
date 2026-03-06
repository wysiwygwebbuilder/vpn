import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert, TextInput, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RefreshCw, ShieldCheck, Plus, Power, Wifi, ChevronLeft, Link as LinkIcon, FileText, Check, Square } from 'lucide-react-native';
import axios from 'axios';
import { Buffer } from 'buffer';
import { SUBSCRIPTION_URLS, parseVlessLink, VlessConfig, extractVlessLinks } from '../src/utils/vless';
import { ServerGroupCard } from '../src/components/ServerGroupCard';
import { vpnService } from '../src/services/vpnService';
import { storageService } from '../src/services/storage';
import { router } from 'expo-router';

interface CustomList {
  id: string;
  name: string;
  content: string;
  servers: VlessConfig[];
  lastUpdated: number;
}

export default function Index() {
  // Data State
  const [publicServers, setPublicServers] = useState<VlessConfig[]>([]);
  const [customLists, setCustomLists] = useState<CustomList[]>([]);

  // UI State
  const [loadingPublic, setLoadingPublic] = useState(false);
  const [connectedServer, setConnectedServer] = useState<VlessConfig | null>(null);
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [connectionError, setConnectionError] = useState<string | null>(null);

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

  // Load Data from Storage on mount
  useEffect(() => {
    const loadData = async () => {
      const savedLists = await storageService.getItem('custom_lists');
      if (savedLists) {
        try {
          setCustomLists(JSON.parse(savedLists));
        } catch (e) {
          console.error("Failed to load custom lists", e);
        }
      }

      const savedPublic = await storageService.getItem('public_servers');
      if (savedPublic) {
        try {
          setPublicServers(JSON.parse(savedPublic));
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

  const fetchPublicServers = async (isBackground = false) => {
    if (!isBackground) setLoadingPublic(true);
    try {
      const responses = await Promise.allSettled(
        SUBSCRIPTION_URLS.map((url: string) => axios.get(url))
      );

      let allLinks: string[] = [];
      responses.forEach((res: any) => {
        if (res.status === 'fulfilled') {
          let data = res.value.data;
          if (typeof data !== 'string') data = JSON.stringify(data);
          try {
            const trimmed = data.trim();
            if (/^[A-Za-z0-9+/=]+$/.test(trimmed) && trimmed.length % 4 === 0) {
              const decoded = Buffer.from(trimmed, 'base64').toString('utf-8');
              if (decoded.includes('vless://')) data = decoded;
            }
          } catch (e) {}

          const lines = data.split(/[\r\n]+/);
          const vless = lines.filter((l: string) => l.trim().startsWith('vless://'));
          allLinks = [...allLinks, ...vless];
        }
      });

      if (allLinks.length === 0) {
        allLinks = [
          'vless://d342d11b-d424-4b70-aa40-18753796c887@example.com:443?security=reality&sni=google.com&fp=chrome&pbk=7_...&sid=68...&type=grpc&serviceName=grpc#Fallback_Server_1',
          'vless://d342d11b-d424-4b70-aa40-18753796c887@1.1.1.1:2053?security=tls&type=ws&path=/ws#Fallback_Server_2',
          'vless://uuid@speedtest.net:8080?security=none&type=tcp#Fast_Server_3'
        ];
      }

      const uniqueLinks = Array.from(new Set(allLinks));
      const shuffled = uniqueLinks.sort(() => 0.5 - Math.random()).slice(0, 150);
      const parsed = shuffled.map(parseVlessLink).filter(Boolean) as VlessConfig[];

      const pinged = await Promise.all(parsed.map(async (s) => {
        const ping = await vpnService.checkConnectivity(s.host, s.port);
        return { ...s, ping };
      }));

      const sorted = pinged.filter(s => s.ping !== -1).sort((a, b) => a.ping - b.ping);
      setPublicServers(sorted);

    } catch (error) {
      console.error("Failed to fetch public servers", error);
    } finally {
      if (!isBackground) setLoadingPublic(false);
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
    updateServerPing(listId, server.id, -999);
    const newPing = await vpnService.checkConnectivity(server.host, server.port);
    updateServerPing(listId, server.id, newPing);
  };

  const handleStopPing = () => {
    shouldStopPing.current = true;
  };

  const handlePingAll = async (listId: string) => {
    if (pingingListId) return;

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
      const ping = await vpnService.checkConnectivity(server.host, server.port);
      updateServerPing(listId, server.id, ping);
      setPingProgress(prev => prev ? { ...prev, current: i + 1 } : null);
    }

    setPingingListId(null);
    setPingProgress(null);
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
      Alert.alert("Invalid VLESS link");
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

  const handleConnect = async (server: VlessConfig) => {
    setConnectionError(null);

    if (connectedServer?.id === server.id) {
      await vpnService.disconnect();
      setStatus('disconnected');
      setConnectedServer(null);
      return;
    }

    const attemptId = Date.now().toString();
    connectionAttemptRef.current = attemptId;
    setStatus('connecting');

    const ping = await vpnService.checkConnectivity(server.host, server.port);

    if (connectionAttemptRef.current !== attemptId) {
      return;
    }

    if (ping > 0) {
      await vpnService.connect(server);
      setConnectedServer(server);
      setStatus('connected');

      if (server.id) {
        if (publicServers.find(s => s.id === server.id)) {
          updateServerPing('default', server.id, ping);
        } else {
          customLists.forEach(list => {
            if (list.servers.find(s => s.id === server.id)) {
              updateServerPing(list.id, server.id, ping);
            }
          });
        }
      }
    } else {
      setStatus('disconnected');
      setConnectedServer(null);
      setConnectionError('Unavailable for connection');
    }
  };

  const handleMainButton = () => {
    if (connectedServer) {
      handleConnect(connectedServer);
    } else {
      let all = [...publicServers];
      customLists.forEach(l => all = [...all, ...l.servers]);
      const best = all.filter(s => s.ping !== -1).sort((a, b) => a.ping - b.ping)[0];
      if (best) handleConnect(best);
    }
  };

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
        const res = await axios.get(newListContent);
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
        const parsed = links.map(parseVlessLink).filter(Boolean) as VlessConfig[];
        if (parsed.length > 0) {
          servers = parsed;
          contentToSave = data;
        }
      } catch (e) {
        console.error("Failed to fetch URL", e);
        Alert.alert("Failed to load list from URL");
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
    setPingingListId(listId);
    const links = extractVlessLinks(content);
    const parsed = links.map(parseVlessLink).filter(Boolean) as VlessConfig[];
    const pinged = await Promise.all(parsed.map(async (s) => {
      const ping = await vpnService.checkConnectivity(s.host, s.port);
      return { ...s, ping };
    }));

    const sorted = pinged.sort((a, b) => {
      if (a.ping === -1) return 1;
      if (b.ping === -1) return -1;
      return a.ping - b.ping;
    });

    setCustomLists(prev => prev.map(l =>
      l.id === listId ? { ...l, servers: sorted, lastUpdated: Date.now() } : l
    ));
    setPingingListId(null);
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <View className="flex-1 flex-col">
        {/* Header */}
        <View className="px-6 pt-6 pb-4 flex-row justify-between items-center bg-white">
          <View className="flex-row items-center gap-3">
            <View className="bg-orange-500 p-2 rounded-lg shadow-lg shadow-orange-200">
              <ShieldCheck size={24} color="#ffffff" />
            </View>
            <View>
              <Text className="text-xl font-bold text-gray-900 leading-none">Феникс</Text>
              <Text className="text-[10px] text-gray-400 font-medium tracking-wide mt-1">
                Свобода от ограничений
              </Text>
            </View>
          </View>
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={openAddModal}
              className="p-2 rounded-full"
            >
              <Plus size={24} color="#9ca3af" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => fetchPublicServers(false)}
              className="p-2 rounded-full"
            >
              <RefreshCw size={20} color={loadingPublic ? '#f97316' : '#9ca3af'} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Connection Status Card */}
        <View className="px-4 mb-2">
          <View className={clsx(
            "rounded-lg p-4 shadow-xl h-24 overflow-hidden relative",
            status === 'connected'
              ? "bg-gradient-to-br from-orange-500 to-red-600"
              : "bg-gray-100"
          )}>
            <View className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl -mr-6 -mt-6 opacity-10 bg-white" />

            <View className="flex-col h-full justify-between relative z-10">
              <View className="flex-row justify-between items-start">
                <View className={clsx(
                  "flex-row items-center gap-2 px-3 py-1 rounded-full backdrop-blur-md",
                  status === 'connected' ? "bg-white/20" : "bg-white/60"
                )}>
                  <Wifi size={12} color={status === 'connected' ? '#ffffff' : '#4b5563'} />
                  <Text className={clsx(
                    "text-[10px] font-bold tracking-widest uppercase",
                    status === 'connected' ? "text-white/90" : "text-gray-600"
                  )}>
                    STATUS
                  </Text>
                </View>

                {status === 'connected' && (
                  <TouchableOpacity
                    onPress={handleMainButton}
                    className="w-8 h-8 bg-white/20 backdrop-blur-md rounded-full items-center justify-center"
                  >
                    <Power size={16} color="#ffffff" />
                  </TouchableOpacity>
                )}
              </View>

              <View>
                <Text className={clsx(
                  "text-lg font-semibold tracking-tight leading-none mb-1",
                  status === 'connected' ? "text-white" : "text-gray-800"
                )}>
                  {status === 'connected' ? 'Connected' : 'Disconnected'}
                </Text>
                <Text
                  numberOfLines={1}
                  className={clsx(
                    "text-[10px] font-medium",
                    status === 'connected' ? "text-white/70" :
                      connectionError ? "text-red-500" : "text-gray-400"
                  )}
                >
                  {status === 'connected' && connectedServer
                    ? `Route via ${connectedServer.name}`
                    : connectionError
                      ? connectionError
                      : status === 'connecting' ? 'Connecting...' : ''}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Scrollable Content */}
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
          {/* Default List */}
          <ServerGroupCard
            id="default"
            name="Main List"
            servers={publicServers}
            isDefault={true}
            onConnect={handleConnect}
            onRefresh={() => fetchPublicServers(false)}
            onPingAll={() => handlePingAll('default')}
            onStopPing={handleStopPing}
            onPingServer={(server) => handlePingServer(server, 'default')}
            onEditServer={(server) => handleOpenEditServer(server, 'default')}
            connectedServerId={connectedServer?.id || null}
            isRefreshing={loadingPublic || pingingListId === 'default'}
            pingProgress={pingingListId === 'default' ? pingProgress : null}
          />

          {/* Custom Lists */}
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
              isRefreshing={pingingListId === list.id}
              pingProgress={pingingListId === list.id ? pingProgress : null}
            />
          ))}

          {/* Empty State */}
          {customLists.length === 0 && (
            <View className="text-center py-8 items-center">
              <Text className="text-sm text-gray-400">No custom lists.</Text>
              <Text className="text-xs mt-1 text-gray-400">Press + to add your servers.</Text>
            </View>
          )}
        </ScrollView>
      </View>

      {/* Add/Edit List Modal */}
      <Modal visible={isModalOpen} animationType="slide" presentationStyle="fullScreen">
        <SafeAreaView className="flex-1 bg-white">
          {/* Modal Header */}
          <View className="px-6 py-4 flex-row items-center gap-4 border-b border-gray-100">
            <TouchableOpacity
              onPress={() => setIsModalOpen(false)}
              className="p-2 -ml-2 rounded-full"
            >
              <ChevronLeft size={24} color="#6b7280" />
            </TouchableOpacity>
            <Text className="text-xl font-bold text-gray-900">Settings</Text>
          </View>

          <ScrollView className="flex-1 p-6">
            <Text className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
              Custom Server Lists
            </Text>

            <View className="space-y-4">
              {/* List Name Input */}
              <TextInput
                value={newListName}
                onChangeText={setNewListName}
                placeholder="List Name"
                placeholderTextColor="#9ca3af"
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900"
              />

              {/* Toggle */}
              <View className="bg-gray-100 p-1 rounded-xl flex-row">
                <TouchableOpacity
                  onPress={() => setAddMethod('url')}
                  className={clsx(
                    "flex-1 py-2 rounded-lg flex-row justify-center items-center gap-2",
                    addMethod === 'url' ? "bg-orange-500" : ""
                  )}
                >
                  <LinkIcon size={14} color={addMethod === 'url' ? '#ffffff' : '#6b7280'} />
                  <Text className={clsx(
                    "text-sm font-bold",
                    addMethod === 'url' ? "text-white" : "text-gray-500"
                  )}>
                    URL
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setAddMethod('text')}
                  className={clsx(
                    "flex-1 py-2 rounded-lg flex-row justify-center items-center gap-2",
                    addMethod === 'text' ? "bg-white" : ""
                  )}
                >
                  <FileText size={14} color={addMethod === 'text' ? '#000000' : '#6b7280'} />
                  <Text className={clsx(
                    "text-sm font-bold",
                    addMethod === 'text' ? "text-gray-800" : "text-gray-500"
                  )}>
                    Text
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Content Input */}
              <TextInput
                value={newListContent}
                onChangeText={setNewListContent}
                placeholder={addMethod === 'url' ? 'URL of server list' : 'Paste vless:// links here...'}
                placeholderTextColor="#9ca3af"
                multiline={addMethod === 'text'}
                numberOfLines={addMethod === 'text' ? 8 : 1}
                className={clsx(
                  "w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm",
                  addMethod === 'text' ? "text-gray-900 font-mono h-32" : "text-gray-900 h-12"
                )}
              />

              {/* Add Button */}
              <TouchableOpacity
                onPress={handleSaveList}
                disabled={!newListName || !newListContent}
                className={clsx(
                  "w-full py-3 rounded-xl flex-row justify-center items-center gap-2",
                  newListName && newListContent ? "bg-orange-500" : "bg-gray-100"
                )}
              >
                <Plus size={18} color={newListName && newListContent ? '#ffffff' : '#9ca3af'} />
                <Text className={clsx(
                  "font-bold",
                  newListName && newListContent ? "text-white" : "text-gray-400"
                )}>
                  Add List
                </Text>
              </TouchableOpacity>
            </View>

            {/* Empty State */}
            <View className="mt-12 flex-col items-center justify-center">
              <View className="w-16 h-16 bg-gray-50 rounded-full items-center justify-center mb-4">
                <View className="w-8 h-8 items-center justify-center">
                  <Text className="text-gray-300 text-2xl">📋</Text>
                </View>
              </View>
              <Text className="text-gray-400 font-medium mb-1">No added lists</Text>
              <Text className="text-xs text-gray-300 text-center">
                Add URL or paste VLESS servers from clipboard
              </Text>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Edit Server Modal */}
      <Modal visible={isServerModalOpen} animationType="slide" transparent={true}>
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-white rounded-t-3xl p-6 max-h-[90%]">
            <View className="flex-row justify-between items-center mb-6">
              <Text className="text-xl font-bold text-gray-900">Edit Server</Text>
              <TouchableOpacity
                onPress={() => setIsServerModalOpen(false)}
                className="p-1 bg-gray-100 rounded-full"
              >
                <View className="w-5 h-5 items-center justify-center">
                  <Text className="text-gray-500 text-lg">✕</Text>
                </View>
              </TouchableOpacity>
            </View>

            <View className="space-y-4">
              <View>
                <Text className="text-xs font-bold text-gray-500 uppercase mb-1">
                  Server Configuration
                </Text>
                <TextInput
                  value={editedServerContent}
                  onChangeText={setEditedServerContent}
                  placeholder="vless://..."
                  placeholderTextColor="#9ca3af"
                  multiline
                  numberOfLines={8}
                  className="w-full h-48 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-xs font-mono text-gray-900"
                />
              </View>

              <TouchableOpacity
                onPress={handleSaveServer}
                disabled={!editedServerContent}
                className={clsx(
                  "w-full py-4 rounded-xl flex-row justify-center items-center gap-2",
                  editedServerContent ? "bg-blue-600" : "bg-gray-100"
                )}
              >
                <Text className={clsx(
                  "font-bold",
                  editedServerContent ? "text-white" : "text-gray-400"
                )}>
                  Save Changes
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function clsx(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}
