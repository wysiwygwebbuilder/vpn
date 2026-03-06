import React from 'react';
import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#f9fafb' }
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="add-list" />
    </Stack>
  );
}
