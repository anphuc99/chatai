import { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
  Splash: undefined;
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainTabParamList>;
};

export type AuthStackParamList = {
  Login: undefined;
};

export type StoryStackParamList = {
  List: undefined;
  Create: { mode: 'create' } | { mode: 'edit'; id: string; title: string; initialSetting: string };
  Detail: { id: string };
  CharacterEditor: { storyId: string; characterId?: string };
  ChatRoom: { storyId: string };
};

export type JournalStackParamList = {
  JournalList: undefined;
  JournalDetail: { sessionId: string };
};

export type MainTabParamList = {
  Home: undefined;
  Stories: NavigatorScreenParams<StoryStackParamList>;
  Journal: NavigatorScreenParams<JournalStackParamList>;
  Profile: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
