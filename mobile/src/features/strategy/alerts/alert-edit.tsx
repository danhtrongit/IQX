import { Stack, useLocalSearchParams } from 'expo-router';

import { ErrorState, LoadingState, Screen } from '@/components/ui';
import { AlertForm } from './alert-form';
import { FeatureDisabledState, AlertsGate } from './gate';
import { isFeatureDisabled } from './form-logic';
import { useAlertDetail } from './hooks';

function EditBody({ id }: { id: string }) {
  const q = useAlertDetail(id);
  if (isFeatureDisabled(q.error)) return <FeatureDisabledState />;
  if (q.isError) return <ErrorState testID="strategy-alerts-detail-error" error={q.error} title="Không tải được cảnh báo" onRetry={() => void q.refetch()} />;
  if (!q.data) return <LoadingState />;
  // key by version so a reload after a 409 resets the form to the fresh server state
  return <AlertForm key={`${q.data.id}-${q.data.current_version}`} alert={q.data} />;
}

export function AlertEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <AlertsGate>
      <Stack.Screen options={{ title: 'Chỉnh cảnh báo' }} />
      {id ? <EditBody id={id} /> : <Screen><LoadingState /></Screen>}
    </AlertsGate>
  );
}

export function AlertNewScreen() {
  return (
    <AlertsGate>
      <AlertForm />
    </AlertsGate>
  );
}
