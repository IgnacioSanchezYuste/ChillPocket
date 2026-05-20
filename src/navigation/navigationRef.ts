import { createNavigationContainerRef, CommonActions } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

/** Navega a una pestaña concreta dentro del Tab navigator. */
export function navigateToTab(tab: string) {
  if (!navigationRef.isReady()) return;
  navigationRef.dispatch(
    CommonActions.navigate({ name: 'Tabs', params: { screen: tab } })
  );
}
