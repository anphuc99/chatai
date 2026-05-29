export type RootStackParamList = {
  Splash: undefined;
  PlaceholderHome: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
