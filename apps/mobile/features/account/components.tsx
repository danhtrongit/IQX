import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Body, Button, Card, Heading, Muted } from '../../components/ui';
import type { AccountSnapshot, AccountStatus } from './types';

export function AccountProfileCard({ account }: { account: AccountSnapshot }) {
  const name = account.profile.displayName || account.profile.email || 'Account';
  return <Card accessibilityLabel="Account profile"><Body style={styles.name}>{name}</Body>{account.profile.email && account.profile.displayName ? <Muted>{account.profile.email}</Muted> : null}</Card>;
}
export function AccountState({ status, onRetry, onSignIn }: { status: AccountStatus; onRetry?: () => void; onSignIn?: () => void }) {
  if (status === 'loading') return <Card accessibilityLabel="Loading account"><Muted>Loading account…</Muted></Card>;
  if (status === 'error') return <Card><Body style={styles.title}>Account unavailable</Body><Muted style={styles.copy}>We could not load your account.</Muted>{onRetry ? <Button variant="secondary" onPress={onRetry}>Retry</Button> : null}</Card>;
  if (status === 'idle' && onSignIn) return <Card><Body style={styles.title}>Sign in to IQX</Body><Muted style={styles.copy}>Sync your watchlist and learning progress across devices.</Muted><Button onPress={onSignIn}>Sign in</Button></Card>;
  return null;
}
export function AccountFeature({ status = 'idle', account, onRetry, onSignIn }: { status?: AccountStatus; account?: AccountSnapshot; onRetry?: () => void; onSignIn?: () => void }) {
  if (status !== 'ready' || !account) return <AccountState status={status} onRetry={onRetry} onSignIn={onSignIn} />;
  return <View><AccountProfileCard account={account} /></View>;
}
const styles = StyleSheet.create({ name: { fontSize: 18, fontWeight: '700', marginBottom: 4 }, title: { fontWeight: '700', marginBottom: 8 }, copy: { marginBottom: 14 } });
