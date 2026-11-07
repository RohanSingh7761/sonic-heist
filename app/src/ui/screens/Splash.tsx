// Opening screen, shown while the wallet and account load.
import React from 'react';
import { Art, Grow, Screen, T, useLayout } from '../kit';
import { C } from '../theme';

// Just the logo: the larger scene art can't decode within the time this screen is up.
export function Splash() {
  const { cw } = useLayout();
  return (
    <Screen mood="night" center flush>
      <Grow />
      <Art name="logo" width={Math.min(cw * 0.8, 320)} label="steal-eth" />
      <T center color={C.gold}>A real-world heist played over sound.</T>
      <Grow />
      <T size="small" muted center>Sneaking in...</T>
      <Grow />
    </Screen>
  );
}
