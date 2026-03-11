import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Plus, Link as LinkIcon, FileText } from 'lucide-react-native';
import { router } from 'expo-router';

export default function AddListScreen() {
  const [listName, setListName] = useState('');
  const [listContent, setListContent] = useState('');
  const [addMethod, setAddMethod] = useState<'url' | 'text'>('url');

  const handleSave = () => {
    router.back();
  };

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="px-6 py-4 flex-row items-center gap-4 border-b border-gray-100">
        <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2 rounded-full">
          <ChevronLeft size={24} color="#6b7280" />
        </TouchableOpacity>
        <Text className="text-xl font-bold text-gray-900">{'Добавить список'}</Text>
      </View>

      <ScrollView className="flex-1 p-6">
        <Text className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">
          {'Пользовательские списки серверов'}
        </Text>

        <View className="space-y-4">
          <TextInput
            value={listName}
            onChangeText={setListName}
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
              <Text className={clsx('text-sm font-bold', addMethod === 'url' ? 'text-white' : 'text-gray-500')}>
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
              <Text className={clsx('text-sm font-bold', addMethod === 'text' ? 'text-gray-800' : 'text-gray-500')}>
                {'Текст'}
              </Text>
            </TouchableOpacity>
          </View>

          <TextInput
            value={listContent}
            onChangeText={setListContent}
            placeholder={addMethod === 'url' ? 'URL списка серверов' : 'Вставьте сюда ссылки vless://...'}
            placeholderTextColor="#9ca3af"
            multiline={addMethod === 'text'}
            numberOfLines={addMethod === 'text' ? 8 : 1}
            className={clsx(
              'w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900',
              addMethod === 'text' ? 'h-32 font-mono' : 'h-12'
            )}
          />

          <TouchableOpacity
            onPress={handleSave}
            disabled={!listName || !listContent}
            className={clsx(
              'w-full py-3 rounded-xl flex-row justify-center items-center gap-2',
              listName && listContent ? 'bg-orange-500' : 'bg-gray-100'
            )}
          >
            <Plus size={18} color={listName && listContent ? '#ffffff' : '#9ca3af'} />
            <Text className={clsx('font-bold', listName && listContent ? 'text-white' : 'text-gray-400')}>
              {'Добавить список'}
            </Text>
          </TouchableOpacity>
        </View>

        <View className="mt-12 flex-col items-center justify-center">
          <View className="w-16 h-16 bg-gray-50 rounded-full items-center justify-center mb-4">
            <View className="w-8 h-8 items-center justify-center">
              <Text className="text-gray-300 text-2xl">+</Text>
            </View>
          </View>
          <Text className="text-gray-400 font-medium mb-1">{'Списки пока не добавлены'}</Text>
          <Text className="text-xs text-gray-300 text-center">
            {'Добавьте URL или вставьте VLESS-серверы из буфера'}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function clsx(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(' ');
}
