import { useState, useEffect, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import { useAuthStore } from '../../../stores/auth.store';
import { profileApi } from '../services/profile.api';
import { avatarService } from '../services/avatar.service';
import { firestoreSubscription } from '../services/firestore.subscription';
import { UserDto, UpdatePreferencesDto } from '@chatai/shared-types';

export function useProfile() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const [loading, setLoading] = useState(false);
  
  // Lưu trữ các bộ hẹn giờ debounce cho từng thuộc tính cài đặt để tránh chồng chéo
  const debounceTimers = useRef<{ [key: string]: any }>({});
  
  // Lưu trữ giá trị cũ để revert nếu có lỗi mạng
  const previousValues = useRef<{ [key: string]: any }>({});

  useEffect(() => {
    if (!user?.uid) return;

    // Đăng ký lắng nghe các thay đổi tiến trình/cài đặt từ Firestore realtime
    const unsub = firestoreSubscription.subscribeUserDoc(user.uid, (docData) => {
      const currentUser = useAuthStore.getState().user;
      if (currentUser) {
        setUser({
          ...currentUser,
          ...docData,
          uid: currentUser.uid, // Đảm bảo uid không bị đè
          email: currentUser.email, // Đảm bảo email không bị đè
        });
      }
    });

    return () => {
      unsub();
      // Clear tất cả các bộ hẹn giờ khi hook unmount
      Object.values(debounceTimers.current).forEach((timer) => clearTimeout(timer));
    };
  }, [user?.uid]);

  const updatePref = useCallback(
    async (key: string, value: any) => {
      if (!user) return;

      // Lưu lại giá trị cũ của field bị thay đổi để revert nếu lỗi
      previousValues.current[key] = key === 'hskLevel' ? user.hskLevel : user.preferences[key as keyof typeof user.preferences];

      let updatedUser: UserDto;

      // Xử lý optimistic update
      if (key === 'hskLevel') {
        updatedUser = {
          ...user,
          hskLevel: value,
        };
      } else {
        updatedUser = {
          ...user,
          preferences: {
            ...user.preferences,
            [key]: value,
          },
        };
      }

      setUser(updatedUser);

      // Thiết lập cơ chế Debounce 300ms cho việc gọi API
      if (debounceTimers.current[key]) {
        clearTimeout(debounceTimers.current[key]);
      }

      debounceTimers.current[key] = setTimeout(async () => {
        try {
          const dto: UpdatePreferencesDto = {};
          if (key === 'hskLevel') {
            dto.hskLevel = value;
          } else {
            dto[key as keyof Omit<UpdatePreferencesDto, 'hskLevel'>] = value;
          }
          await profileApi.patchPreferences(dto);
        } catch (error: any) {
          console.error(`[useProfile] Failed to update preference ${key}:`, error);
          Alert.alert('Lỗi', 'Không thể kết nối tới máy chủ để lưu cài đặt.');
          // Revert lại trạng thái cũ từ ref
          const revertedUser = { ...useAuthStore.getState().user! };
          if (key === 'hskLevel') {
            revertedUser.hskLevel = previousValues.current[key];
          } else {
            revertedUser.preferences = {
              ...revertedUser.preferences,
              [key]: previousValues.current[key],
            };
          }
          setUser(revertedUser);
        }
      }, 300);
    },
    [user, setUser]
  );

  const pickAndUploadAvatar = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const picked = await avatarService.pickImage();
      if (!picked) {
        setLoading(false);
        return;
      }

      const prepared = await avatarService.resizeAndCompress(picked.uri);
      if (prepared.sizeBytes > 2 * 1024 * 1024) {
        Alert.alert('Thông báo', 'Dung lượng ảnh quá lớn (vượt quá 2MB)');
        setLoading(false);
        return;
      }

      const fd = avatarService.toFormData(prepared);
      const { photoURL } = await profileApi.uploadAvatar(fd);

      // Cập nhật photoURL mới
      setUser({
        ...user,
        photoURL,
      });
      Alert.alert('Thành công', 'Đã cập nhật ảnh đại diện.');
    } catch (error: any) {
      console.error('[useProfile] Upload avatar error:', error);
      Alert.alert('Lỗi', error.message || 'Lỗi trong quá trình cập nhật avatar');
    } finally {
      setLoading(false);
    }
  }, [user, setUser]);

  const signOut = useCallback(async () => {
    try {
      await logout();
    } catch (error: any) {
      console.error('[useProfile] Logout error:', error);
      Alert.alert('Lỗi', 'Không thể đăng xuất. Vui lòng thử lại.');
    }
  }, [logout]);

  return {
    user,
    loading,
    updatePref,
    pickAndUploadAvatar,
    signOut,
  };
}
