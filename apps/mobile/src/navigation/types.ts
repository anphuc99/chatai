export type RootStackParamList = {
  Login: undefined;
  PlaceholderHome: undefined;
  Profile: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
