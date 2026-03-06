import React, { useState, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, FlatList } from 'react-native';
import { Trash2, RefreshCw, Pencil, Globe, Clipboard, Copy, Check, ShieldCheck, Square } from 'lucide-react-native';
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
  isRefreshing?: boolean;
  pingProgress?: { current: number; total: number } | null;
}

const ITEMS_PER_PAGE = 10;

export const ServerGroupCard: React.FC<ServerGroupProps> = ({
  name,
  servers,
  lastUpdated,
  isDefault,
  onConnect,
  onRefresh,
  onPingAll,
  onStopPing,
  onPingServer,
  onEditServer,
  onEdit,
  onDelete,
  connectedServerId,
  isRefreshing,
  pingProgress
}) => {
  const [page, setPage] = useState(1);
  const [copied, setCopied] = useState(false);

  const activeServers = useMemo(() => {
    return servers;
  }, [servers]);

  const totalPages = Math.ceil(activeServers.length / ITEMS_PER_PAGE);

  const currentServers = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return activeServers.slice(start, start + ITEMS_PER_PAGE);
  }, [activeServers, page]);

  const handleCopyAll = () => {
    const allLinks = activeServers.map(s => s.raw).join('\n');
    // In React Native, we'd use Clipboard.setString
    console.log('Copying all servers:', allLinks);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyServer = useCallback((server: VlessConfig) => {
    console.log('Copying server:', server.raw);
  }, []);

  const handleEditServer = useCallback((server: VlessConfig) => {
    onEditServer?.(server);
  }, [onEditServer]);

  const renderItem = ({ item }: { item: VlessConfig }) => (
    <ServerItem
      server={item}
      isConnected={connectedServerId === item.id}
      onConnect={onConnect}
      onCopy={handleCopyServer}
      onEdit={handleEditServer}
      onPing={onPingServer}
    />
  );

  return (
    <View className="bg-white rounded-xl p-2 shadow-sm border-y border-gray-100 mb-2">
      {/* Header */}
      <View className="flex-row justify-between items-start mb-4">
        <View className="flex-row items-center gap-3">
          <View className={clsx(
            "p-2.5 rounded-xl",
            isDefault ? "bg-orange-50" : "bg-violet-50"
          )}>
            {isDefault ? (
              <Globe size={20} color={isDefault ? '#ea580c' : '#7c3aed'} />
            ) : (
              <Clipboard size={20} color="#7c3aed" />
            )}
          </View>
          <View>
            <Text className="font-bold text-gray-800 text-lg leading-tight">{name}</Text>
            <View className="flex-row items-center gap-2 mt-0.5">
              <View className="px-2 py-0.5 bg-gray-100 rounded-md">
                <Text className="text-xs font-medium text-gray-500">
                  {activeServers.length} active
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View className="flex-row gap-1">
          <TouchableOpacity
            onPress={handleCopyAll}
            className="p-2 rounded-full"
          >
            {copied ? (
              <Check size={18} color="#22c55e" />
            ) : (
              <Copy size={18} color="#9ca3af" />
            )}
          </TouchableOpacity>

          {pingProgress ? (
            <TouchableOpacity
              onPress={onStopPing}
              className="p-2 rounded-full bg-red-50"
            >
              <Square size={18} color="#ef4444" fill="#ef4444" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={onPingAll}
              disabled={isRefreshing}
              className={clsx(
                "p-2 rounded-full",
                isRefreshing && "opacity-50"
              )}
            >
              <ShieldCheck size={18} color={isRefreshing ? '#22c55e' : '#9ca3af'} />
            </TouchableOpacity>
          )}

          {!isDefault && (
            <TouchableOpacity
              onPress={onRefresh}
              disabled={isRefreshing}
              className="p-2 rounded-full"
            >
              <RefreshCw size={18} color={isRefreshing ? '#3b82f6' : '#9ca3af'} />
            </TouchableOpacity>
          )}

          {!isDefault && (
            <>
              <TouchableOpacity onPress={onEdit} className="p-2 rounded-full">
                <Pencil size={18} color="#9ca3af" />
              </TouchableOpacity>
              <TouchableOpacity onPress={onDelete} className="p-2 rounded-full">
                <Trash2 size={18} color="#9ca3af" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* Progress Bar */}
      {pingProgress && (
        <View className="mb-4">
          <View className="flex-row justify-between mb-1">
            <Text className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">
              Checking availability...
            </Text>
            <Text className="text-[10px] text-gray-400 font-medium">
              {Math.round((pingProgress.current / pingProgress.total) * 100)}%
            </Text>
          </View>
          <View className="h-1 bg-gray-100 rounded-full overflow-hidden">
            <View 
              className="h-full bg-orange-500"
              style={{ width: `${(pingProgress.current / pingProgress.total) * 100}%` }}
            />
          </View>
        </View>
      )}

      {/* Server List */}
      <View>
        {activeServers.length === 0 ? (
          <View className="py-4 border-2 border-dashed border-gray-100 rounded-xl items-center">
            <Text className="text-xs text-gray-400 font-medium">
              No active servers available
            </Text>
          </View>
        ) : (
          <FlatList
            data={currentServers}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
          />
        )}
      </View>

      {/* Pagination */}
      {totalPages > 1 && (
        <View className="flex-row justify-between items-center mt-4 pt-2 border-t border-gray-50">
          <TouchableOpacity
            onPress={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-1 rounded-lg"
          >
            <View className={page === 1 ? "opacity-30" : ""}>
              <View className="w-5 h-5 items-center justify-center">
                <Text className="text-gray-500 text-lg">‹</Text>
              </View>
            </View>
          </TouchableOpacity>
          <Text className="text-xs font-medium text-gray-400">
            Page {page} of {totalPages}
          </Text>
          <TouchableOpacity
            onPress={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-1 rounded-lg"
          >
            <View className={page === totalPages ? "opacity-30" : ""}>
              <View className="w-5 h-5 items-center justify-center">
                <Text className="text-gray-500 text-lg">›</Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};
