import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Globe, Copy, Pencil, ShieldCheck, Play, Power, RefreshCw } from 'lucide-react-native';
import { VlessConfig } from '../utils/vless';
import { clsx } from 'clsx';

export interface ServerItemProps {
  server: VlessConfig;
  isConnected: boolean;
  onConnect: (s: VlessConfig) => void;
  onCopy: (s: VlessConfig) => void;
  onEdit: (s: VlessConfig) => void;
  onPing: (s: VlessConfig) => void;
}

export const ServerItem: React.FC<ServerItemProps> = ({
  server,
  isConnected,
  onConnect,
  onCopy,
  onEdit,
  onPing
}) => {
  const getPingColor = () => {
    if (server.ping === -999) return 'text-blue-500';
    if (server.ping === -1) return 'text-red-500';
    if (server.ping === -2) return 'text-amber-500';
    if (server.ping < 150) return 'text-emerald-500';
    if (server.ping < 300) return 'text-amber-500';
    return 'text-red-500';
  };

  const getPingText = () => {
    if (server.ping === -999) return 'Checking...';
    if (server.ping === -1) return 'Unavailable';
    if (server.ping === -2) return 'Timeout';
    return `${server.ping}ms`;
  };

  return (
    <View className={clsx(
      "flex-row items-center justify-between py-3 px-2 rounded-lg border mb-1",
      isConnected
        ? "bg-orange-50 border-orange-200"
        : "border-transparent"
    )}>
      <View className="flex-row items-center gap-3 flex-1 min-w-0">
        <View className="text-cyan-500">
          <Globe size={20} color={isConnected ? '#f97316' : '#9ca3af'} strokeWidth={1.5} />
        </View>
        <View className="flex-1 min-w-0">
          <View className="flex-row items-center gap-2">
            <Text 
              numberOfLines={1}
              className={clsx(
                "text-sm font-semibold",
                isConnected ? "text-orange-700" : "text-gray-900"
              )}
            >
              {server.name}
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            <Text className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">
              Reality
            </Text>
            <Text className="text-gray-300 text-[10px]">•</Text>
            <View className="flex-row items-center gap-1">
              {server.ping === -999 ? (
                <>
                  <RefreshCw size={12} color="#3b82f6" className="animate-spin" />
                  <Text className={clsx("text-[10px] font-bold font-mono", getPingColor())}>
                    Checking...
                  </Text>
                </>
              ) : (
                <Text className={clsx("text-[10px] font-bold font-mono", getPingColor())}>
                  {getPingText()}
                </Text>
              )}
            </View>
          </View>
        </View>
      </View>

      <View className="flex-row items-center gap-2 pl-2">
        <TouchableOpacity
          onPress={() => onCopy(server)}
          className="w-8 h-8 items-center justify-center rounded-md border border-gray-100"
        >
          <Copy size={14} color="#9ca3af" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => onEdit(server)}
          className="w-8 h-8 items-center justify-center rounded-md border border-gray-100"
        >
          <Pencil size={14} color="#9ca3af" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => onPing(server)}
          className="w-8 h-8 items-center justify-center rounded-md border border-gray-100"
        >
          <ShieldCheck size={14} color="#9ca3af" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => onConnect(server)}
          className={clsx(
            "w-8 h-8 items-center justify-center rounded-md border ml-1",
            isConnected
              ? "bg-orange-500 border-orange-500"
              : "bg-white border-emerald-500"
          )}
        >
          {isConnected ? (
            <Power size={16} color="#ffffff" />
          ) : (
            <Play size={16} color="#10b981" fill="#10b981" />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};
