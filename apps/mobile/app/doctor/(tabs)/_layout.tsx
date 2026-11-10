import { Tabs } from 'expo-router';
import { doctorApp } from '../../../src/apps/doctor/tabs';
import { tabIcons } from '../../../src/icons';
import { fonts } from '../../../src/theme';
import { useTheme } from '../../../src/theme-context';

export default function DoctorTabs() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.teal,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 12 },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          borderTopWidth: 1,
          height: 64,
        },
        tabBarItemStyle: { minHeight: 48, paddingVertical: 6 },
      }}
    >
      {doctorApp.tabs.map((tab) => {
        const Icon = tabIcons[tab.icon];
        return (
          <Tabs.Screen
            key={tab.name}
            name={tab.name}
            options={{
              title: tab.title,
              tabBarAccessibilityLabel: tab.title,
              tabBarIcon: ({ color }) => <Icon size={20} color={color} strokeWidth={1.5} />,
            }}
          />
        );
      })}
    </Tabs>
  );
}
