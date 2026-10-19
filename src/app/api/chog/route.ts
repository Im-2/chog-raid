import { parseUnits } from "viem";
import { CHOG, perkEffects, perksFor } from "@/config/chog";
import { env } from "@/lib/env";
import { allowedAttempts, bonusPayments, chogBalance, chogEnabled, chogToken, paymentConfig, viemChain } from "@/server/chog";
import { currentRaider } from "@/server/identity";
import { daily, snapshot } from "@/server/progress";
import { dailyAttempts, dayKey } from "@/server/retention";
import { sessionAddress } from "@/server/session";
import { getStore } from "@/server/store";

/**
 * Everything the $CHOG surfaces need (nav badge, landing panel, Daily card, wallet menu, /chog):
 * the wallet's real balance and perks, today's attempts, and, only for a signed-in wallet and only
 * when it's configured, the optional payment. (Season Rewards: /api/rewards.)
 */
export async function GET() {
  const [snap, wallet, me] = await Promise.all([snapshot(), sessionAddress(), currentRaider()]);
  const day = dayKey(new Date());
  const today = daily(snap, me);
  const enabled = chogEnabled();
  const pay = paymentConfig();
  const explorer = process.env.NEXT_PUBLIC_BLOCK_EXPLORER_URL?.replace(/\/$/, "") ?? null;

  // Real on-chain balance; null = no wallet, or the RPC couldn't be read (shown as "unavailable").
  const balance = enabled && wallet ? await chogBalance(wallet) : null;
  const paid = wallet ? await bonusPayments(getStore(), wallet, day) : 0;
  const used = me ? dailyAttempts(snap.raids, day, today.tokenId, me).length : 0;
  const effects = perkEffects(balance);

  let payment = null;
  if (pay && wallet) {
    const decimals = env.rpcUrl ? await viemChain(env.rpcUrl).decimals(pay.token).catch(() => CHOG.decimals) : CHOG.decimals;
    payment = {
      amount: pay.amount,
      amountWei: parseUnits(String(pay.amount), decimals).toString(),
      token: pay.token,
      recipient: pay.recipient,
      chainId: env.chainId,
      chainName: env.chainName,
      rpcUrl: env.rpcUrl ?? null,
      boughtToday: paid,
      maxPerDay: CHOG.payment.maxPerDay,
      bonusAttempts: CHOG.payment.bonusAttempts,
    };
  }

  return Response.json(
    {
      enabled,
      signedIn: !!wallet,
      wallet: wallet ?? null,
      token: chogToken(),
      explorer,
      balance,
      balanceUnavailable: enabled && !!wallet && balance === null,
      perks: perksFor(balance),
      tier: effects.tier,
      effects: { badge: effects.badge, extraAttempts: effects.extraAttempts, torch: effects.torch },
      attempts: { free: CHOG.daily.freeAttempts, paid: paid * CHOG.payment.bonusAttempts, perk: effects.extraAttempts, allowed: allowedAttempts(paid, balance), used },
      payment,
      paymentConfigured: !!pay,
      paymentAmount: pay?.amount ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
