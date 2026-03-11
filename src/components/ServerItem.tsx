import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Check, Copy, Globe, Pencil, Play, Power, RefreshCw, ShieldCheck } from 'lucide-react-native';
import { clsx } from 'clsx';
import { VlessConfig } from '../utils/vless';

export interface ServerItemProps {
  server: VlessConfig;
  connectionState: 'idle' | 'connecting' | 'connected';
  isCopied: boolean;
  onConnect: (server: VlessConfig) => void;
  onCopy: (server: VlessConfig) => void;
  onEdit: (server: VlessConfig) => void;
  onPing: (server: VlessConfig) => void;
}

export const ServerItem: React.FC<ServerItemProps> = ({ server, connectionState, isCopied, onConnect, onCopy, onEdit, onPing }) => {
  const pingText =
    server.ping > 0
      ? `${server.ping} ms`
      : server.ping === 0
        ? 'без проверки'
        : server.ping === -999
          ? 'проверка'
          : 'недоступен';

  const pingColor =
    server.ping > 0 ? 'text-emerald-600' : server.ping === 0 ? 'text-slate-500' : server.ping === -999 ? 'text-blue-600' : 'text-red-500';

  const isConnected = connectionState === 'connected';
  const isConnecting = connectionState === 'connecting';

  return (
    <View
      className={clsx(
        'mb-2 rounded-xl border p-3',
        isConnected
          ? 'border-orange-300 bg-orange-50'
          : isConnecting
            ? 'border-amber-300 bg-amber-50'
            : 'border-gray-200 bg-white'
      )}
    >
      <View className="flex-row items-center justify-between">
        <View className="mr-3 flex-1 flex-row items-center">
          <View className="mr-3 rounded-lg bg-slate-100 p-2">
            <Globe size={18} color={isConnected ? '#ea580c' : isConnecting ? '#f59e0b' : '#64748b'} />
          </View>
          <View className="flex-1">
            <Text numberOfLines={1} className={clsx('text-sm font-semibold', isConnected ? 'text-orange-700' : isConnecting ? 'text-amber-700' : 'text-gray-900')}>
              {server.name}
            </Text>
            <Text numberOfLines={1} className="mt-1 text-xs text-gray-500">
              {server.host}:{server.port}
            </Text>
            <Text className={clsx('mt-1 text-xs font-medium', pingColor)}>{pingText}</Text>
          </View>
        </View>

        <View className="flex-row items-center">
          <TouchableOpacity onPress={() => onCopy(server)} className="mr-1 rounded-lg border border-gray-200 p-2">
            {isCopied ? <Check size={14} color="#16a34a" /> : <Copy size={14} color="#94a3b8" />}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onEdit(server)} className="mr-1 rounded-lg border border-gray-200 p-2">
            <Pencil size={14} color="#94a3b8" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onPing(server)} className="mr-1 rounded-lg border border-gray-200 p-2">
            {server.ping === -999 ? <RefreshCw size={14} color="#2563eb" /> : <ShieldCheck size={14} color="#94a3b8" />}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onConnect(server)}
            disabled={isConnecting}
            className={clsx(
              'rounded-lg border p-2',
              isConnected
                ? 'border-orange-500 bg-orange-500'
                : isConnecting
                  ? 'border-amber-500 bg-amber-500'
                  : 'border-emerald-500 bg-white'
            )}
          >
            {isConnected ? (
              <Power size={14} color="#ffffff" />
            ) : isConnecting ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Play size={14} color="#10b981" fill="#10b981" />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};
