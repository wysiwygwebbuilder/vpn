import AsyncStorage from '@react-native-async-storage/async-storage';

export const storageService = {
    getItem: async (key: string): Promise<string | null> => {
        try {
            const value = await AsyncStorage.getItem(key);
            return value ?? null;
        } catch (e) {
            console.error("Failed to get item from storage", e);
            return null;
        }
    },
    setItem: async (key: string, value: string): Promise<void> => {
        try {
            await AsyncStorage.setItem(key, value);
        } catch (e) {
            console.error("Failed to set item in storage", e);
        }
    },
    removeItem: async (key: string): Promise<void> => {
        try {
            await AsyncStorage.removeItem(key);
        } catch (e) {
            console.error("Failed to remove item from storage", e);
        }
    },
    getAllKeys: async (): Promise<readonly string[]> => {
        try {
            return await AsyncStorage.getAllKeys();
        } catch (e) {
            console.error("Failed to get all keys", e);
            return [];
        }
    },
    clear: async (): Promise<void> => {
        try {
            await AsyncStorage.clear();
        } catch (e) {
            console.error("Failed to clear storage", e);
        }
    }
};
