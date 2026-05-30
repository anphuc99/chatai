import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';

export interface PickedImage {
  uri: string;
  mimeType: string;
}

export interface PreparedImage {
  uri: string;
  mimeType: 'image/jpeg';
  sizeBytes: number;
}

export const avatarService = {
  async pickImage(): Promise<PickedImage | null> {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) {
      throw new Error('Quyền truy cập thư viện ảnh bị từ chối');
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (result.canceled) {
      return null;
    }

    const asset = result.assets?.[0];
    if (!asset) {
      return null;
    }
    return {
      uri: asset.uri,
      mimeType: asset.mimeType ?? 'image/jpeg',
    };
  },

  async resizeAndCompress(uri: string): Promise<PreparedImage> {
    const manipResult = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 512, height: 512 } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
    );

    let sizeBytes = 0;
    try {
      const fileInfo = await FileSystem.getInfoAsync(manipResult.uri);
      if (fileInfo.exists) {
        sizeBytes = fileInfo.size;
      }
    } catch (error) {
      console.warn('[AvatarService] Failed to get file size:', error);
    }

    return {
      uri: manipResult.uri,
      mimeType: 'image/jpeg',
      sizeBytes,
    };
  },

  toFormData(prepared: PreparedImage): FormData {
    const fd = new FormData();
    
    fd.append('file', {
      uri: prepared.uri,
      type: prepared.mimeType,
      name: `avatar_${Date.now()}.jpg`,
    } as any);

    return fd;
  },
};
