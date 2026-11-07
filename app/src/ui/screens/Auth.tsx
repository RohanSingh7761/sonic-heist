// Login and sign up. The username shows on the leaderboard; nearby players still see the random name from your wallet.
import React, { useState } from 'react';
import { TextInput } from 'react-native';
import { logInAccount, signUpAccount } from '../../game/engine';
import { MIN_PASSWORD, USERNAME_RULE } from '../../game/account';
import { Art, Btn, Grow, Panel, Screen, T, useLayout } from '../kit';
import { C, FONT, U } from '../theme';

function Field({ label, value, onChange, secure }: { label: string; value: string; onChange: (v: string) => void; secure?: boolean }) {
  return (
    <>
      <T size="small">{label}</T>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        secureTextEntry={secure}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={secure ? 'password' : 'username'}
        placeholderTextColor={C.muted}
        style={{ fontFamily: FONT, fontSize: 21, color: C.ink, backgroundColor: C.cream, borderWidth: U, borderColor: C.ink, paddingHorizontal: 10, minHeight: 48 }}
      />
    </>
  );
}

export function Auth() {
  const { cw } = useLayout();
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signingUp = mode === 'signup';

  const submit = async () => {
    const name = username.trim();
    if (!USERNAME_RULE.test(name)) return setError('Usernames are 3 to 20 letters, numbers or underscores.');
    if (password.length < MIN_PASSWORD) return setError(`Passwords need at least ${MIN_PASSWORD} characters.`);
    setError(null);
    setBusy(true);
    try {
      await (signingUp ? signUpAccount(name, password) : logInAccount(name, password));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
      setBusy(false);
    }
  };

  return (
    <Screen mood="night" center>
      <Grow />
      <Art name="logo" width={Math.min(cw * 0.7, 280)} label="steal-eth" />
      <Panel style={{ gap: 8 }}>
        <T size="heading">{signingUp ? 'Create your account' : 'Welcome back'}</T>
        <Field label="Username" value={username} onChange={setUsername} />
        <Field label="Password" value={password} onChange={setPassword} secure />
        {error && <T size="small" color={C.redDark}>{error}</T>}
        <Btn tone="gold" big disabled={busy} onPress={submit}>{busy ? 'Securing your wallet...' : signingUp ? 'Sign up' : 'Log in'}</Btn>
        <Btn small disabled={busy} onPress={() => { setMode(signingUp ? 'login' : 'signup'); setError(null); }}>
          {signingUp ? 'I already have an account' : 'Create a new account'}
        </Btn>
        {signingUp && <T size="small" muted>Your password also protects your wallet, and it can't be reset. Keep it safe.</T>}
      </Panel>
      <Grow />
    </Screen>
  );
}
