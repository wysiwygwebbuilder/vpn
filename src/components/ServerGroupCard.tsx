import React, { useMemo, useRef, useState } from 'react';
import { FlatList, Text, TouchableOpacity, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Check, Clipboard as ClipboardIcon, Copy, Globe, Pencil, RefreshCw, Square, Trash2 } from 'lucide-react-native';
import { clsx } from 'clsx';
import { VlessConfig } from '../utils/vless';
import { ServerItem } from './ServerItem';

export interface ServerGroupProps {
  id: string;
  name: string;
  servers: VlessConfig[];
  lastUpdated?: number;
  isDefault?: boolean;
  onConnect: (server: VlessConfig) => void;
  onRefresh: () => void;
  onPingAll: () => void;
  onStopPing?: () => void;
  onPingServer: (server: VlessConfig) => void;
  onEditServer?: (server: VlessConfig) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  connectedServerId: string | null;
  connectingServerId?: string | null;
  isRefreshing?: boolean;
  pingProgress?: { current: number; total: number } | null;
}

const ITEMS_PER_PAGE = 10;
const COPIED_RESET_MS = 1200;

export const ServerGroupCard: React.FC<ServerGroupProps> = ({
  name,
  servers,
  lastUpdated,
  isDefault,
  onConnect,
  onPingAll,
  onStopPing,
  onPingServer,
  onEditServer,
  onEdit,
  onDelete,
  connectedServerId,
  connectingServerId,
  isRefreshing,
  pingProgress,
}) => {
  const [page, setPage] = useState(1);
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedServerId, setCopiedServerId] = useState<string | null>(null);
  const copiedAllTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedServerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalPages = Math.max(1, Math.ceil(servers.length / ITEMS_PER_PAGE));

  const currentServers = useMemo(() => {
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * ITEMS_PER_PAGE;
    return servers.slice(start, start + ITEMS_PER_PAGE);
  }, [page, servers, totalPages]);

  const handleCopyAll = async () => {
    if (servers.length === 0) {
      return;
    }

    await Clipboard.setStringAsync(servers.map((server) => server.raw).join('\n'));
    setCopiedAll(true);
    if (copiedAllTimeoutRef.current) {
      clearTimeout(copiedAllTimeoutRef.current);
    }
    copiedAllTimeoutRef.current = setTimeout(() => setCopiedAll(false), COPIED_RESET_MS);
  };

  const handleCopyServer = async (server: VlessConfig) => {
    await Clipboard.setStringAsync(server.raw);
    setCopiedServerId(server.id);
    if (copiedServerTimeoutRef.current) {
      clearTimeout(copiedServerTimeoutRef.current);
    }
    copiedServerTimeoutRef.current = setTimeout(() => setCopiedServerId(null), COPIED_RESET_MS);
  };

  const pagination = totalPages > 1 ? (
    <View className="flex-row items-center justify-between pt-3">
      <TouchableOpacity onPress={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1}>
        <Text className={clsx('text-sm', page === 1 ? 'text-gray-300' : 'text-orange-600')}>Назад</Text>
      </TouchableOpacity>
      <Text className="text-xs text-gray-500">Страница {Math.min(page, totalPages)} из {totalPages}</Text>
      <TouchableOpacity onPress={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page === totalPages}>
        <Text className={clsx('text-sm', page === totalPages ? 'text-gray-300' : 'text-orange-600')}>Далее</Text>
      </TouchableOpacity>
    </View>
  ) : null;

  return (
    <View className="mx-4 mb-3 rounded-2xl border border-gray-200 bg-white p-4">
      <View className="mb-4 flex-row items-start justify-between gap-3">
        <View className="mr-3 flex-row items-center">
          <View className={clsx('mr-3 rounded-xl p-2', isDefault ? 'bg-orange-100' : 'bg-slate-100')}>
            {isDefault ? <Globe size={18} color="#ea580c" /> : <ClipboardIcon size={18} color="#475569" />}
          </View>
          <Text className="text-sm font-semibold text-gray-900">{servers.length}</Text>
        </View>

        <View className="flex-row items-center gap-2">
          {pingProgress ? (
            <TouchableOpacity onPress={onStopPing} className="flex-row items-center rounded-full border border-red-200 bg-red-50 px-3 py-2">
              <Square size={14} color="#dc2626" fill="#dc2626" />
              <Text className="ml-2 text-xs font-semibold text-red-700">Остановить</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={onPingAll}
              disabled={isRefreshing}
              className={clsx(
                'flex-row items-center rounded-full border px-3 py-2',
                isRefreshing ? 'border-emerald-200 bg-emerald-50' : 'border-orange-200 bg-orange-50'
              )}
            >
              <RefreshCw size={14} color={isRefreshing ? '#16a34a' : '#ea580c'} />
              <Text className={clsx('ml-2 text-xs font-semibold', isRefreshing ? 'text-emerald-700' : 'text-orange-700')}>
                {isRefreshing ? 'Проверяем...' : 'Проверить доступность'}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity onPress={() => void handleCopyAll()} className="rounded-full p-2">
            {copiedAll ? <Check size={18} color="#16a34a" /> : <Copy size={18} color="#94a3b8" />}
          </TouchableOpacity>

          {!isDefault && (
            <TouchableOpacity onPress={onEdit} className="rounded-full p-2">
              <Pencil size={18} color="#94a3b8" />
            </TouchableOpacity>
          )}

          {!isDefault && (
            <TouchableOpacity onPress={onDelete} className="rounded-full p-2">
              <Trash2 size={18} color="#94a3b8" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {lastUpdated ? (
        <Text className="mb-3 text-[11px] text-gray-400">
          {'Обновлено ' + new Date(lastUpdated).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      ) : null}


      {pingProgress && (
        <View className="mb-4">
          <View className="mb-1 flex-row justify-between">
            <Text className="text-xs text-gray-500">Проверка серверов</Text>
            <Text className="text-xs text-gray-500">
              {pingProgress.current}/{pingProgress.total}
            </Text>
          </View>
          <View className="h-2 overflow-hidden rounded-full bg-gray-100">
            <View
              className="h-full rounded-full bg-orange-500"
              style={{ width: `${(pingProgress.current / Math.max(pingProgress.total, 1)) * 100}%` }}
            />
          </View>
        </View>
      )}

      {pagination ? <View className="mb-4 border-t border-gray-100">{pagination}</View> : null}

      {servers.length === 0 ? (
        <View className="rounded-xl border border-dashed border-gray-200 p-4">
          <Text className="text-center text-sm text-gray-500">Список пуст</Text>
        </View>
      ) : (
        <FlatList
          data={currentServers}
          renderItem={({ item }) => (
            <ServerItem
              server={item}
              connectionState={connectedServerId === item.id ? 'connected' : connectingServerId === item.id ? 'connecting' : 'idle'}
              isCopied={copiedServerId === item.id}
              onConnect={onConnect}
              onCopy={() => void handleCopyServer(item)}
              onEdit={() => onEditServer?.(item)}
              onPing={() => onPingServer(item)}
            />
          )}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
        />
      )}

      {pagination ? <View className="mt-4 border-t border-gray-100">{pagination}</View> : null}
    </View>
  );
};
