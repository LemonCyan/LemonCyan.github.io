/**
 * LemonCyan Quant Terminal - 纯前端数据引擎 (engine.js)
 * 集成指标与 Alpha 因子因果安全计算、东方财富单源行情拉取、分层缓存与并发扫描。
 */

(function (global) {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 1: 统一技术指标与六大维度 Alpha 因子计算引擎
  // ═══════════════════════════════════════════════════════════════════════════

  const EMA_FAST_PERIOD = 20;
  const EMA_SLOW_PERIOD = 60;
  const VOL5_PERIOD = 5;
  const VOL60_PERIOD = 60;

  const MACD_FAST = 12;
  const MACD_SLOW = 26;
  const MACD_SIGNAL = 9;

  const RSI_PERIOD = 12;
  const RSI_DIV_LOOKBACK = 28;
  const RSI_DIV_MIN_BARS = 4;

  const TD9_SETUP_COUNT = 9;
  const TD9_LOOKBACK = 4;

  const ROC_LONG_PERIOD = 34;
  const ROC_ACCEL_BASE = 5;
  const ROC_ACCEL_LAG = 3;
  const STOCH_D_PERIOD = 21;

  const GK_VOL_PERIOD = 14;
  const REALIZED_VOL_PERIOD = 10;
  const VOL_SPIKE_RATIO = 1.35;

  const BOLL_PERIOD_20 = 20;
  const BOLL_STD_MULT = 2.0;
  const KELTNER_PERIOD = 20;
  const KELTNER_ATR_MULT = 1.5;

  const MFI_PERIOD = 14;
  const CMF_PERIOD = 40;

  const EMA_TREND_144 = 144;
  const EMA_TREND_200 = 200;

  const EMA_SCISSORS_FAST = 21;
  const EMA_SCISSORS_SLOW = 55;
  const MACD_SLOW_FAST = 19;
  const MACD_SLOW_SLOW = 39;
  const MACD_SLOW_SIGNAL = 9;

  const DONCHIAN_ENTRY_PERIOD = 55;
  const DONCHIAN_EXIT_PERIOD = 20;

  function isFiniteNum(v) {
    return typeof v === 'number' && Number.isFinite(v);
  }

  function cleanNumericArray(arr, fallbackZero = false) {
    const n = arr.length;
    const out = new Float64Array(n);
    let lastValid = NaN;
    for (let i = 0; i < n; i++) {
      const v = Number(arr[i]);
      if (Number.isFinite(v)) {
        lastValid = v;
        out[i] = v;
      } else if (Number.isFinite(lastValid)) {
        out[i] = lastValid;
      } else {
        out[i] = fallbackZero ? 0.0 : NaN;
      }
    }
    return out;
  }

  function ewmAlpha(arr, alpha, minPeriods = 1) {
    const n = arr.length;
    const out = new Float64Array(n);
    let ema = NaN;
    let count = 0;
    const oneMinusA = 1.0 - alpha;

    for (let i = 0; i < n; i++) {
      const x = arr[i];
      if (Number.isFinite(x)) {
        count += 1;
        ema = Number.isFinite(ema) ? (alpha * x + oneMinusA * ema) : x;
        out[i] = count >= minPeriods ? ema : NaN;
      } else {
        out[i] = count >= minPeriods ? ema : NaN;
      }
    }
    return out;
  }

  function ewmSpan(arr, span, minPeriods = 1) {
    return ewmAlpha(arr, 2.0 / (span + 1.0), minPeriods);
  }

  function rollingMean(arr, window, minPeriods = 1) {
    const n = arr.length;
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const start = Math.max(0, i - window + 1);
      let sum = 0.0;
      let count = 0;
      for (let j = start; j <= i; j++) {
        const v = arr[j];
        if (Number.isFinite(v)) {
          sum += v;
          count += 1;
        }
      }
      out[i] = count >= minPeriods ? sum / count : NaN;
    }
    return out;
  }

  function rollingStd(arr, window, minPeriods = 2) {
    const n = arr.length;
    const out = new Float64Array(n);
    const effMin = Math.max(1, minPeriods);
    for (let i = 0; i < n; i++) {
      const start = Math.max(0, i - window + 1);
      let sum = 0.0;
      let count = 0;
      for (let j = start; j <= i; j++) {
        const v = arr[j];
        if (Number.isFinite(v)) {
          sum += v;
          count += 1;
        }
      }
      if (count < effMin || count < 2) {
        out[i] = NaN;
        continue;
      }
      const mean = sum / count;
      let sq = 0.0;
      for (let j = start; j <= i; j++) {
        const v = arr[j];
        if (Number.isFinite(v)) {
          const d = v - mean;
          sq += d * d;
        }
      }
      out[i] = Math.sqrt(sq / (count - 1));
    }
    return out;
  }

  function rollingMinMax(arr, window, minPeriods = 1, isMax = false) {
    const n = arr.length;
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const start = Math.max(0, i - window + 1);
      let best = NaN;
      let count = 0;
      for (let j = start; j <= i; j++) {
        const v = arr[j];
        if (Number.isFinite(v)) {
          count += 1;
          if (!Number.isFinite(best) || (isMax ? v > best : v < best)) {
            best = v;
          }
        }
      }
      out[i] = count >= minPeriods ? best : NaN;
    }
    return out;
  }

  function rollingMinMaxShifted(arr, window, isMax = false) {
    const raw = rollingMinMax(arr, window, window, isMax);
    const n = arr.length;
    const out = new Float64Array(n);
    if (n > 0) out[0] = NaN;
    for (let i = 1; i < n; i++) {
      out[i] = raw[i - 1];
    }
    return out;
  }

  function rollingSum(arr, window, minPeriods = 1) {
    const n = arr.length;
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const start = Math.max(0, i - window + 1);
      let sum = 0.0;
      let count = 0;
      for (let j = start; j <= i; j++) {
        const v = arr[j];
        if (Number.isFinite(v)) {
          sum += v;
          count += 1;
        }
      }
      out[i] = count >= minPeriods ? sum : NaN;
    }
    return out;
  }

  function rollingMedian(arr, window, minPeriods = 1) {
    const n = arr.length;
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const start = Math.max(0, i - window + 1);
      const vals = [];
      for (let j = start; j <= i; j++) {
        if (Number.isFinite(arr[j])) vals.push(arr[j]);
      }
      if (vals.length < minPeriods) {
        out[i] = NaN;
        continue;
      }
      vals.sort((a, b) => a - b);
      const mid = vals.length >> 1;
      out[i] = vals.length % 2 === 1 ? vals[mid] : (vals[mid - 1] + vals[mid]) * 0.5;
    }
    return out;
  }

  function computeTrueRange(high, low, close) {
    const n = close.length;
    const tr = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const cPrev = i > 0 ? close[i - 1] : close[0];
      const tr1 = high[i] - low[i];
      const tr2 = Math.abs(high[i] - cPrev);
      const tr3 = Math.abs(low[i] - cPrev);
      const val = Math.max(tr1, tr2, tr3);
      tr[i] = Number.isFinite(val) ? val : 1e-8;
    }
    return tr;
  }

  function computeAtr(high, low, close, period = 14) {
    const tr = computeTrueRange(high, low, close);
    const atr = ewmAlpha(tr, 1.0 / period, period);
    for (let i = 0; i < atr.length; i++) {
      if (!Number.isFinite(atr[i])) atr[i] = 1e-8;
    }
    return atr;
  }

  function calculateAllIndicators(bars) {
    if (!Array.isArray(bars) || bars.length === 0) return [];

    const n = bars.length;
    const open = cleanNumericArray(bars.map((b) => b.open ?? b.close));
    const high = cleanNumericArray(bars.map((b) => b.high ?? b.close));
    const low = cleanNumericArray(bars.map((b) => b.low ?? b.close));
    const close = cleanNumericArray(bars.map((b) => b.close));
    const volume = cleanNumericArray(bars.map((b) => b.volume ?? 0.0), true);

    // 1. 经典均线与均量
    const emaFast = ewmSpan(close, EMA_FAST_PERIOD);
    const emaSlow = ewmSpan(close, EMA_SLOW_PERIOD);
    const vol5 = rollingMean(volume, VOL5_PERIOD, 1);
    const vol60 = rollingMean(volume, VOL60_PERIOD, 1);

    // 2. MACD (12, 26, 9)
    const macdEmaFast = ewmSpan(close, MACD_FAST);
    const macdEmaSlow = ewmSpan(close, MACD_SLOW);
    const dif = new Float64Array(n);
    for (let i = 0; i < n; i++) dif[i] = macdEmaFast[i] - macdEmaSlow[i];
    const dea = ewmSpan(dif, MACD_SIGNAL);
    const macdHist = new Float64Array(n);
    for (let i = 0; i < n; i++) macdHist[i] = dif[i] - dea[i];

    // 3. RSI(12) + 因果安全顶底背离
    const gain = new Float64Array(n);
    const loss = new Float64Array(n);
    gain[0] = NaN;
    loss[0] = NaN;
    for (let i = 1; i < n; i++) {
      const d = close[i] - close[i - 1];
      gain[i] = d > 0 ? d : 0.0;
      loss[i] = d < 0 ? -d : 0.0;
    }
    const avgGain = ewmAlpha(gain, 1.0 / RSI_PERIOD, RSI_PERIOD);
    const avgLoss = ewmAlpha(loss, 1.0 / RSI_PERIOD, RSI_PERIOD);
    const rsi = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const ag = avgGain[i];
      const al = avgLoss[i];
      if (!Number.isFinite(ag) || !Number.isFinite(al)) {
        rsi[i] = 50.0;
      } else if (ag === 0.0 && al === 0.0) {
        rsi[i] = 50.0;
      } else if (al === 0.0) {
        rsi[i] = 100.0;
      } else if (ag === 0.0) {
        rsi[i] = 0.0;
      } else {
        const rs = ag / al;
        rsi[i] = 100.0 - 100.0 / (1.0 + rs);
      }
    }

    const rsiDiv = new Int8Array(n);
    if (n > RSI_DIV_LOOKBACK) {
      for (let i = RSI_DIV_LOOKBACK; i < n; i++) {
        const winStart = i - RSI_DIV_LOOKBACK;
        const winEnd = i - RSI_DIV_MIN_BARS + 1;

        let idxCMin = winStart;
        let idxRsiMin = winStart;
        let idxCMax = winStart;
        let idxRsiMax = winStart;

        for (let k = winStart + 1; k < winEnd; k++) {
          if (close[k] < close[idxCMin]) idxCMin = k;
          if (rsi[k] < rsi[idxRsiMin]) idxRsiMin = k;
          if (close[k] > close[idxCMax]) idxCMax = k;
          if (rsi[k] > rsi[idxRsiMax]) idxRsiMax = k;
        }

        let isBull = false;
        if (rsi[idxCMin] <= 42.0 && (low[i] <= low[idxCMin] || close[i] <= close[idxCMin]) && rsi[i] > rsi[idxCMin] + 1.0) {
          isBull = true;
        } else if (rsi[idxRsiMin] <= 40.0 && (low[i] <= low[idxRsiMin] || close[i] <= close[idxRsiMin]) && rsi[i] > rsi[idxRsiMin] + 1.0) {
          isBull = true;
        }
        if (isBull && rsiDiv[i - 1] === 1 && low[i] >= low[i - 1]) isBull = false;
        if (isBull && rsi[i] <= 55.0 && rsi[i] > rsi[i - 1]) {
          rsiDiv[i] = 1;
          continue;
        }

        let isBear = false;
        if (rsi[idxCMax] >= 58.0 && (high[i] >= high[idxCMax] || close[i] >= close[idxCMax]) && rsi[i] < rsi[idxCMax] - 1.0) {
          isBear = true;
        } else if (rsi[idxRsiMax] >= 60.0 && (high[i] >= high[idxRsiMax] || close[i] >= close[idxRsiMax]) && rsi[i] < rsi[idxRsiMax] - 1.0) {
          isBear = true;
        }
        if (isBear && rsiDiv[i - 1] === -1 && high[i] <= high[i - 1]) isBear = false;
        if (isBear && rsi[i] >= 45.0 && rsi[i] < rsi[i - 1]) {
          rsiDiv[i] = -1;
        }
      }
    }

    // 4. TD9 神奇九转
    const td9BuySetup = new Int8Array(n);
    const td9SellSetup = new Int8Array(n);
    const td9PerfectBuy = new Uint8Array(n);
    const td9PerfectSell = new Uint8Array(n);
    let buyCount = 0;
    let sellCount = 0;
    for (let i = 0; i < n; i++) {
      if (i < TD9_LOOKBACK) continue;
      if (close[i] < close[i - TD9_LOOKBACK]) {
        buyCount = Math.min(buyCount + 1, TD9_SETUP_COUNT);
        sellCount = 0;
      } else if (close[i] > close[i - TD9_LOOKBACK]) {
        sellCount = Math.min(sellCount + 1, TD9_SETUP_COUNT);
        buyCount = 0;
      } else {
        buyCount = 0;
        sellCount = 0;
      }
      td9BuySetup[i] = buyCount;
      td9SellSetup[i] = sellCount;

      if (i >= 8) {
        if (buyCount === TD9_SETUP_COUNT) {
          const min67 = Math.min(low[i - 3], low[i - 2]);
          if (low[i] <= min67 || low[i - 1] <= min67) td9PerfectBuy[i] = 1;
        }
        if (sellCount === TD9_SETUP_COUNT) {
          const max67 = Math.max(high[i - 3], high[i - 2]);
          if (high[i] >= max67 || high[i - 1] >= max67) td9PerfectSell[i] = 1;
        }
      }
    }

    // 5. 六大维度 Alpha 因子
    // 5.1 长动量 (ROC)
    const logRetC = new Float64Array(n);
    const logRoc34 = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const cPrev = i > 0 ? close[i - 1] : close[0];
      logRetC[i] = Math.log(close[i] / (cPrev + 1e-8));
      const cRef34 = i >= ROC_LONG_PERIOD ? close[i - ROC_LONG_PERIOD] : close[i];
      logRoc34[i] = Math.log(close[i] / (cRef34 + 1e-8));
    }
    const roc34 = logRoc34;

    const rollVolRaw = rollingStd(logRetC, 30, 5);
    const rollVol = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const rv = rollVolRaw[i];
      rollVol[i] = (!Number.isFinite(rv) || rv === 0.0) ? 0.01 : rv;
    }

    const smoothVel = ewmSpan(logRetC, ROC_ACCEL_BASE);
    const atr14 = computeAtr(high, low, close, 14);
    const lMin = rollingMinMax(low, STOCH_D_PERIOD, 1, false);
    const hMax = rollingMinMax(high, STOCH_D_PERIOD, 1, true);
    const stochK = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const rangeHL = Math.max(hMax[i] - lMin[i], 0.05 * atr14[i]);
      stochK[i] = 100.0 * (close[i] - lMin[i]) / (rangeHL + 1e-8);
    }
    const stochD = ewmSpan(stochK, 3);
    const stochD21 = new Float64Array(n);
    const rocState = new Int8Array(n);

    const sqrtRoc34 = Math.sqrt(ROC_LONG_PERIOD);
    for (let i = 0; i < n; i++) {
      const sd = Number.isFinite(stochD[i]) ? (stochD[i] - 50.0) / 50.0 : 0.0;
      stochD21[i] = Math.max(-1.0, Math.min(1.0, sd));
      const z = logRoc34[i] / (rollVol[i] * sqrtRoc34 + 1e-8);
      const velLag = i >= ROC_ACCEL_LAG ? smoothVel[i - ROC_ACCEL_LAG] : smoothVel[i];
      const accel = (smoothVel[i] - velLag) / (rollVol[i] + 1e-8);
      if (z > 0.5 && accel > 0) rocState[i] = 1;
      else if (z < -0.5 && accel < 0) rocState[i] = -1;
    }

    // 5.2 极值微观波动率 (GKYZ + Realized Vol)
    const sqrtAnn = Math.sqrt(252);
    const gkFactor = 2.0 * Math.log(2.0) - 1.0;
    const gkyzInstant = new Float64Array(n);
    const logRetO = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const cPrev = i > 0 ? close[i - 1] : open[0];
      const ov = Math.log(open[i] / (cPrev + 1e-8));
      const hl = Math.log(high[i] / (low[i] + 1e-8));
      const co = Math.log(close[i] / (open[i] + 1e-8));
      gkyzInstant[i] = ov * ov + 0.5 * hl * hl - gkFactor * co * co;
      logRetO[i] = Math.log(close[i] / (cPrev + 1e-8));
    }
    const gkyzRoll = rollingMean(gkyzInstant, GK_VOL_PERIOD, 3);
    const rVolRaw = rollingStd(logRetO, REALIZED_VOL_PERIOD, 3);
    const gkyzVol14 = new Float64Array(n);
    const realizedVol10 = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      gkyzVol14[i] = (Number.isFinite(gkyzRoll[i]) ? Math.sqrt(Math.max(gkyzRoll[i], 0.0)) : 0.0) * sqrtAnn;
      realizedVol10[i] = (Number.isFinite(rVolRaw[i]) ? rVolRaw[i] : 0.0) * sqrtAnn;
    }
    const longVolBase = rollingMean(gkyzVol14, 60, 15);
    const volSpikeFlag = new Int8Array(n);
    for (let i = 0; i < n; i++) {
      const base = Number.isFinite(longVolBase[i]) ? longVolBase[i] : 0.01;
      if (gkyzVol14[i] / (base + 1e-8) >= VOL_SPIKE_RATIO) volSpikeFlag[i] = 1;
    }

    // 5.3 通道挤压 (Carter TTM Squeeze)
    const mid20 = rollingMean(close, BOLL_PERIOD_20, 5);
    const std20 = rollingStd(close, BOLL_PERIOD_20, 5);
    const atrKc = computeAtr(high, low, close, KELTNER_PERIOD);
    const midKc = ewmSpan(close, KELTNER_PERIOD);

    const bollBandwidth20 = new Float64Array(n);
    const bollPctB20 = new Float64Array(n);
    const bollSqueeze = new Int8Array(n);
    const bollBreakout = new Int8Array(n);

    const upperBb = new Float64Array(n);
    const lowerBb = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const s20 = Number.isFinite(std20[i]) ? std20[i] : 0.0;
      const m20 = mid20[i];
      const uBb = m20 + BOLL_STD_MULT * s20;
      const lBb = m20 - BOLL_STD_MULT * s20;
      upperBb[i] = uBb;
      lowerBb[i] = lBb;
      const bw = Number.isFinite(m20) ? (uBb - lBb) / (m20 + 1e-8) : 0.0;
      bollBandwidth20[i] = Number.isFinite(bw) ? bw : 0.0;
      const pb = Number.isFinite(uBb) ? (close[i] - lBb) / (uBb - lBb + 1e-8) : 0.5;
      bollPctB20[i] = Math.max(-0.2, Math.min(1.2, Number.isFinite(pb) ? pb : 0.5));

      const uKc = midKc[i] + KELTNER_ATR_MULT * atrKc[i];
      const lKc = midKc[i] - KELTNER_ATR_MULT * atrKc[i];
      if (Number.isFinite(uBb) && Number.isFinite(lBb) && uBb < uKc && lBb > lKc) {
        bollSqueeze[i] = 1;
      }
    }
    for (let i = 0; i < n; i++) {
      const wasSq = i > 0 && bollSqueeze[i - 1] === 1;
      const isSq = bollSqueeze[i] === 1;
      const fired = wasSq && !isSq;
      const bwExpand = i > 0 && bollBandwidth20[i] > bollBandwidth20[i - 1];
      if ((fired && close[i] > upperBb[i]) || (!wasSq && close[i] > upperBb[i] && bwExpand)) {
        bollBreakout[i] = 1;
      } else if ((fired && close[i] < lowerBb[i]) || (!wasSq && close[i] < lowerBb[i] && bwExpand)) {
        bollBreakout[i] = -1;
      }
    }

    // 5.4 真实资金流 (MFI + 3-MAD CMF)
    const clv = new Float64Array(n);
    const tp = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const hlRange = Math.max(high[i] - low[i], 1e-8);
      clv[i] = Math.max(-1.0, Math.min(1.0, ((close[i] - low[i]) - (high[i] - close[i])) / hlRange));
      tp[i] = (high[i] + low[i] + close[i]) / 3.0;
    }
    const posFlow = new Float64Array(n);
    const negFlow = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const tpRet = (i > 0 && tp[i - 1] !== 0) ? (tp[i] - tp[i - 1]) / tp[i - 1] : 0.0;
      const vBuy = volume[i] * 0.5 * (1.0 + clv[i]);
      const vSell = volume[i] * 0.5 * (1.0 - clv[i]);
      posFlow[i] = vBuy * tp[i] * (1.0 + Math.max(tpRet, 0.0));
      negFlow[i] = vSell * tp[i] * (1.0 + Math.max(-tpRet, 0.0));
    }
    const posSum = rollingSum(posFlow, MFI_PERIOD, 3);
    const negSum = rollingSum(negFlow, MFI_PERIOD, 3);
    const mfi14 = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      if (!Number.isFinite(posSum[i]) || !Number.isFinite(negSum[i])) {
        mfi14[i] = 50.0;
      } else {
        const mr = posSum[i] / (negSum[i] + 1e-8);
        mfi14[i] = Math.max(0.0, Math.min(100.0, 100.0 - 100.0 / (1.0 + mr)));
      }
    }

    const vMedRaw = rollingMedian(volume, CMF_PERIOD, 10);
    const vMed = new Float64Array(n);
    const vDiff = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      vMed[i] = Number.isFinite(vMedRaw[i]) ? vMedRaw[i] : volume[i];
      vDiff[i] = Math.abs(volume[i] - vMed[i]);
    }
    const vMadRaw = rollingMedian(vDiff, CMF_PERIOD, 10);
    const clvVClean = new Float64Array(n);
    const vClean = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const mad = Number.isFinite(vMadRaw[i]) ? vMadRaw[i] : 0.0;
      const cap = vMed[i] + 3.0 * 1.4826 * mad;
      vClean[i] = Math.min(volume[i], cap);
      clvVClean[i] = clv[i] * vClean[i];
    }
    const cmfNum = rollingSum(clvVClean, CMF_PERIOD, 10);
    const cmfDen = rollingSum(vClean, CMF_PERIOD, 10);
    const cmf40 = new Float64Array(n);
    const mfiState = new Int8Array(n);
    for (let i = 0; i < n; i++) {
      const cVal = Number.isFinite(cmfNum[i]) && Number.isFinite(cmfDen[i]) ? cmfNum[i] / (cmfDen[i] + 1e-8) : 0.0;
      cmf40[i] = Math.max(-1.0, Math.min(1.0, cVal));
      if (mfi14[i] > 58.0 && cmf40[i] > 0.03) mfiState[i] = 1;
      else if (mfi14[i] < 42.0 && cmf40[i] < -0.03) mfiState[i] = -1;
    }

    // 5.5 长周期趋势偏离 (EMA144/200)
    const ema144 = ewmSpan(close, EMA_TREND_144);
    const ema200 = ewmSpan(close, EMA_TREND_200);
    const spreadEma144 = new Float64Array(n);
    const spreadEma200 = new Float64Array(n);
    const trendAlignment = new Int8Array(n);
    for (let i = 0; i < n; i++) {
      spreadEma144[i] = (close[i] - ema144[i]) / (ema144[i] + 1e-8);
      spreadEma200[i] = (close[i] - ema200[i]) / (ema200[i] + 1e-8);
      if (close[i] > ema144[i] && ema144[i] > ema200[i]) trendAlignment[i] = 1;
      else if (close[i] < ema144[i] && ema144[i] < ema200[i]) trendAlignment[i] = -1;
    }

    // 5.6 跨周期剪刀差 (EMA 21/55 + 慢速 MACD 19/39/9)
    const atr20 = computeAtr(high, low, close, 20);
    const ema21 = ewmSpan(close, EMA_SCISSORS_FAST);
    const ema55 = ewmSpan(close, EMA_SCISSORS_SLOW);
    const ema19 = ewmSpan(close, MACD_SLOW_FAST);
    const ema39 = ewmSpan(close, MACD_SLOW_SLOW);
    const difSlow = new Float64Array(n);
    for (let i = 0; i < n; i++) difSlow[i] = ema19[i] - ema39[i];
    const deaSlow = ewmSpan(difSlow, MACD_SLOW_SIGNAL);

    const emaRatio2155 = new Float64Array(n);
    const macdHistSlow = new Float64Array(n);
    const scissorsExpansion = new Int8Array(n);
    for (let i = 0; i < n; i++) {
      emaRatio2155[i] = (ema21[i] - ema55[i]) / (ema55[i] + 1e-8);
      macdHistSlow[i] = (difSlow[i] - deaSlow[i]) / (atr20[i] + 1e-8);
      const rDiff = i > 0 ? emaRatio2155[i] - emaRatio2155[i - 1] : 0.0;
      if (emaRatio2155[i] > 0 && rDiff > 0) scissorsExpansion[i] = 1;
      else if (emaRatio2155[i] < 0 && rDiff < 0) scissorsExpansion[i] = -1;
    }

    // 5.7 唐奇安通道 (Donchian 55入 / 20出，严格滞后 t-1，收盘突破判定)
    const dcUpper55 = rollingMinMaxShifted(high, DONCHIAN_ENTRY_PERIOD, true);
    const dcLower20 = rollingMinMaxShifted(low, DONCHIAN_EXIT_PERIOD, false);
    const dcMid = new Float64Array(n);
    const dcPos = new Float64Array(n);
    const dcSignal = new Int8Array(n);
    for (let i = 0; i < n; i++) {
      const u55 = dcUpper55[i];
      const l20 = dcLower20[i];
      if (Number.isFinite(u55) && Number.isFinite(l20)) {
        dcMid[i] = (u55 + l20) * 0.5;
        const span = u55 - l20;
        dcPos[i] = span > 1e-8 ? (close[i] - l20) / span : 0.5;
        if (close[i] > u55) dcSignal[i] = 1;
        else if (close[i] < l20) dcSignal[i] = -1;
      } else {
        dcMid[i] = NaN;
        dcPos[i] = NaN;
        if (Number.isFinite(l20) && close[i] < l20) {
          dcSignal[i] = -1;
        }
      }
    }

    // 6. 组装全量特征上下文列表 (每根 Bar 含 prev_* 对比项)
    const contexts = new Array(n);
    for (let i = 0; i < n; i++) {
      const b = bars[i];
      const curClose = close[i];
      const prevClose = i >= 1 ? close[i - 1] : null;
      const changePct = (prevClose !== null && prevClose > 0)
        ? ((curClose - prevClose) / prevClose) * 100.0
        : 0.0;

      contexts[i] = {
        timestamp: Number(b.time_sec),
        time_str: String(b.date || b.time_sec),
        change_pct: changePct,
        close: curClose,
        ema_fast: emaFast[i],
        ema_slow: emaSlow[i],
        vol5: vol5[i],
        vol60: vol60[i],
        macd_hist: macdHist[i],
        rsi: rsi[i],
        rsi_divergence: rsiDiv[i],
        td9_buy_setup: td9BuySetup[i],
        td9_sell_setup: td9SellSetup[i],
        td9_perfect_buy: Boolean(td9PerfectBuy[i]),
        td9_perfect_sell: Boolean(td9PerfectSell[i]),
        prev_close: prevClose,
        prev_macd_hist: i >= 1 ? macdHist[i - 1] : null,
        roc_34: roc34[i],
        stoch_d_21: stochD21[i],
        roc_state: rocState[i],
        garman_klass_vol_14: gkyzVol14[i],
        realized_vol_10: realizedVol10[i],
        vol_spike_flag: volSpikeFlag[i],
        boll_bandwidth_20: bollBandwidth20[i],
        boll_pct_b_20: bollPctB20[i],
        boll_squeeze: bollSqueeze[i],
        boll_breakout: bollBreakout[i],
        mfi_14: mfi14[i],
        cmf_40: cmf40[i],
        mfi_state: mfiState[i],
        spread_ema_144: spreadEma144[i],
        spread_ema_200: spreadEma200[i],
        trend_alignment: trendAlignment[i],
        ema_ratio_21_55: emaRatio2155[i],
        macd_hist_slow: macdHistSlow[i],
        scissors_expansion: scissorsExpansion[i],
        donchian_upper_55: dcUpper55[i],
        donchian_lower_20: dcLower20[i],
        donchian_mid: dcMid[i],
        donchian_pos: dcPos[i],
        donchian_signal: dcSignal[i],
        atr_20: i >= 20 ? atr20[i] : NaN,
      };
    }

    return contexts;
  }

  function round4(v) {
    return Math.round(v * 10000) / 10000;
  }

  function formatSeriesForTv(contexts, field) {
    const out = [];
    for (let i = 0; i < contexts.length; i++) {
      const ctx = contexts[i];
      const v = ctx?.[field];
      if (isFiniteNum(v)) {
        out.push({ time: Number(ctx.timestamp), value: round4(v) });
      }
    }
    return out;
  }

  function formatTd9Markers(contexts) {
    const markers = [];
    for (let i = 0; i < contexts.length; i++) {
      const ctx = contexts[i];
      const t = Number(ctx.timestamp);
      if (ctx.td9_buy_setup === 9) {
        markers.push({
          time: t,
          position: 'belowBar',
          color: '#a855f7',
          shape: 'circle',
          size: 0,
          text: ctx.td9_perfect_buy ? 'P9' : '9',
        });
      } else if (ctx.td9_sell_setup === 9) {
        markers.push({
          time: t,
          position: 'aboveBar',
          color: '#f59e0b',
          shape: 'circle',
          size: 0,
          text: ctx.td9_perfect_sell ? 'P9' : '9',
        });
      }
    }
    return markers;
  }

  function formatRsiDivergenceMarkers(contexts) {
    const markers = [];
    for (let i = 0; i < contexts.length; i++) {
      const ctx = contexts[i];
      const t = Number(ctx.timestamp);
      if (ctx.rsi_divergence === 1) {
        markers.push({ time: t, position: 'belowBar', color: '#818cf8', shape: 'circle', size: 0, text: 'R' });
      } else if (ctx.rsi_divergence === -1) {
        markers.push({ time: t, position: 'aboveBar', color: '#fb923c', shape: 'circle', size: 0, text: 'R' });
      }
    }
    return markers;
  }

  function formatDonchianMarkers(contexts) {
    const markers = [];
    for (let i = 0; i < contexts.length; i++) {
      const ctx = contexts[i];
      const t = Number(ctx.timestamp);
      if (ctx.donchian_signal === 1) {
        markers.push({ time: t, position: 'belowBar', color: '#2dd4bf', shape: 'circle', size: 0, text: 'D' });
      } else if (ctx.donchian_signal === -1) {
        markers.push({ time: t, position: 'aboveBar', color: '#fb7185', shape: 'circle', size: 0, text: 'D' });
      }
    }
    return markers;
  }

  function extractRecentAlerts(contexts, lookback = 3) {
    if (!Array.isArray(contexts) || contexts.length === 0) return [];

    const total = contexts.length;
    const lb = Math.max(1, Math.min(lookback, 10));
    const startIdx = Math.max(0, total - lb);
    const hits = [];

    for (let i = total - 1; i >= startIdx; i--) {
      const ctx = contexts[i];
      if (!ctx) continue;
      const longSources = [];
      const shortSources = [];

      if (ctx.td9_buy_setup === 9) longSources.push('TD9');
      if (ctx.rsi_divergence === 1) longSources.push('RSI');
      if (ctx.donchian_signal === 1) longSources.push('DC');

      if (ctx.td9_sell_setup === 9) shortSources.push('TD9');
      if (ctx.rsi_divergence === -1) shortSources.push('RSI');
      if (ctx.donchian_signal === -1) shortSources.push('DC');

      const hasLong = longSources.length > 0;
      const hasShort = shortSources.length > 0;
      if (!hasLong && !hasShort) continue;

      let direction = 'long';
      if (hasLong && hasShort) direction = 'conflict';
      else if (hasShort) direction = 'short';

      hits.push({
        bar_offset: total - 1 - i,
        direction,
        sources: Array.from(new Set([...longSources, ...shortSources])),
      });
    }

    return hits;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 2: 东方财富单源行情拉取、分层缓存与并发扫描客户端
  // ═══════════════════════════════════════════════════════════════════════════

  const EM_ULIST_URL = 'https://push2.eastmoney.com/api/qt/ulist.np/get';
  const EM_KLINE_URL = 'https://push2his.eastmoney.com/api/qt/stock/kline/get';

  const HISTORY_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 小时历史 K 线基线
  const QUOTE_CACHE_TTL_MS = 10 * 60 * 1000;        // 10 分钟实时现价与估值缓存
  const MAX_SCAN_CONCURRENCY = 6;                   // 浏览器同源并发控制

  const ALL_ITEMS = [
    // 全球大宗与美股
    { code: 'GC=F',   secid: '101.GC00Y', name: 'COMEX黄金',       assetType: 'futures' },
    { code: 'CL=F',   secid: '102.CL00Y', name: 'NYMEX原油',       assetType: 'futures' },
    { code: 'SPY',    secid: '107.SPY',   name: 'SPY 标普500',     assetType: 'us_etf' },
    { code: 'TQQQ',   secid: '105.TQQQ',  name: 'TQQQ 3x做多纳指', assetType: 'us_etf' },
    { code: 'SQQQ',   secid: '105.SQQQ',  name: 'SQQQ 3x做空纳指', assetType: 'us_etf' },
    { code: 'KORU',   secid: '107.KORU',  name: 'KORU 3x做多韩国', assetType: 'us_etf' },
    { code: 'NVDA',   secid: '105.NVDA',  name: '英伟达',          assetType: 'us_stock' },
    { code: 'AAPL',   secid: '105.AAPL',  name: '苹果',            assetType: 'us_stock' },
    { code: 'GOOGL',  secid: '105.GOOGL', name: '谷歌-A',          assetType: 'us_stock' },
    { code: 'TSLA',   secid: '105.TSLA',  name: '特斯拉',          assetType: 'us_stock' },
    { code: 'MU',     secid: '105.MU',    name: '美光科技',        assetType: 'us_stock' },
    { code: 'BABA',   secid: '106.BABA',  name: '阿里巴巴',        assetType: 'us_stock' },
    { code: 'SPCX',   secid: '105.SPCX',  name: 'SpaceX',          assetType: 'us_stock' },
    // A股指数与ETF
    { code: '899050', secid: '0.899050',  name: '北证50',           assetType: 'index' },
    { code: '510100', secid: '1.510100',  name: '上证50ETF(大盘)',  assetType: 'cn_etf' },
    { code: '510300', secid: '1.510300',  name: '沪深300ETF',       assetType: 'cn_etf' },
    { code: '510500', secid: '1.510500',  name: '中证500ETF(中盘)', assetType: 'cn_etf' },
    { code: '588080', secid: '1.588080',  name: '科创板50ETF',      assetType: 'cn_etf' },
    { code: '159915', secid: '0.159915',  name: '创业板ETF',        assetType: 'cn_etf' },
    { code: '513130', secid: '1.513130',  name: '恒生科技ETF',      assetType: 'cn_etf' },
    { code: '159941', secid: '0.159941',  name: '纳指ETF',          assetType: 'cn_etf' },
    { code: '159612', secid: '0.159612',  name: '标普500ETF',       assetType: 'cn_etf' },
    { code: '512800', secid: '1.512800',  name: '银行ETF',          assetType: 'cn_etf' },
    { code: '512690', secid: '1.512690',  name: '酒ETF',            assetType: 'cn_etf' },
    { code: '512660', secid: '1.512660',  name: '军工ETF',          assetType: 'cn_etf' },
    { code: '512010', secid: '1.512010',  name: '医药ETF',          assetType: 'cn_etf' },
    { code: '159825', secid: '0.159825',  name: '农业ETF',          assetType: 'cn_etf' },
    { code: '515220', secid: '1.515220',  name: '煤炭ETF',          assetType: 'cn_etf' },
    { code: '159934', secid: '0.159934',  name: '黄金ETF',          assetType: 'cn_etf' },
    { code: '510880', secid: '1.510880',  name: '红利ETF',          assetType: 'cn_etf' },
  ];

  const META_BY_CODE = new Map(ALL_ITEMS.map((item) => [item.code.toUpperCase(), item]));

  function toFinite(v) {
    if (v === null || v === undefined || v === '' || v === '-') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function round2(v) {
    return Math.round(v * 100) / 100;
  }

  function parseDateUtcSec(dateStr) {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(dateStr || '').trim());
    if (!m) return null;
    return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 1000);
  }

  function cleanKlineStrings(rawLines) {
    if (!Array.isArray(rawLines) || rawLines.length === 0) return [];
    const byTime = new Map();

    for (const line of rawLines) {
      const parts = String(line || '').split(',');
      if (parts.length < 6) continue;
      const dateStr = parts[0].trim();
      const timeSec = parseDateUtcSec(dateStr);
      const close = toFinite(parts[2]);
      if (timeSec === null || close === null || close <= 0) continue;

      const openRaw = toFinite(parts[1]);
      const highRaw = toFinite(parts[3]);
      const lowRaw = toFinite(parts[4]);
      const volRaw = toFinite(parts[5]);

      const open = openRaw !== null && openRaw > 0 ? openRaw : close;
      const high = Math.max(highRaw ?? close, open, close);
      const low = Math.min(lowRaw ?? close, open, close);
      const volume = volRaw !== null && volRaw >= 0 ? volRaw : 0.0;

      byTime.set(timeSec, { time_sec: timeSec, date: dateStr, open, high, low, close, volume });
    }

    return Array.from(byTime.values()).sort((a, b) => a.time_sec - b.time_sec);
  }

  function computeMultiPeriodChanges(bars, curPrice) {
    if (!Array.isArray(bars) || bars.length === 0 || !(curPrice > 0)) {
      return { chg_3d: null, chg_5d: null, chg_20d: null };
    }
    const n = bars.length;
    const calc = (offset) => {
      if (n < offset + 1) return null;
      const refClose = bars[n - 1 - offset]?.close;
      return refClose > 0 ? round2(((curPrice - refClose) / refClose) * 100) : null;
    };
    return {
      chg_3d: calc(3),
      chg_5d: calc(5),
      chg_20d: calc(20),
    };
  }

  function buildValuation(meta, row, price) {
    if (!meta || !row) return null;
    if (meta.assetType === 'cn_etf') {
      const iopvRaw = toFinite(row.f441);
      const iopv = iopvRaw !== null && iopvRaw > 0 ? iopvRaw : null;
      const premiumPct = iopv && price > 0 ? round2(((price - iopv) / iopv) * 100) : null;
      return { symbol: meta.code, is_etf: true, iopv, premium_pct: premiumPct, pe_ttm: null, pb: null };
    }
    if (meta.assetType === 'us_stock') {
      const peRaw = toFinite(row.f115);
      const pbRaw = toFinite(row.f23);
      return {
        symbol: meta.code,
        is_etf: false,
        iopv: null,
        premium_pct: null,
        pe_ttm: peRaw !== null && peRaw > 0 ? peRaw : null,
        pb: pbRaw !== null && pbRaw > 0 ? pbRaw : null,
      };
    }
    return null;
  }

  async function runWithConcurrency(items, limit, worker) {
    const results = new Array(items.length);
    let idx = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (idx < items.length) {
        const cur = idx++;
        results[cur] = await worker(items[cur], cur);
      }
    });
    await Promise.all(workers);
    return results;
  }

  const MarketClient = {
    _watchlistCache: null,       // { expiresAt, items, byCode }
    _watchlistInflight: null,
    _klineCache: new Map(),      // code -> { historyExpiresAt, quoteExpiresAt, bars, contexts }
    _klineInflight: new Map(),   // code -> Promise

    getSymbolMeta(symbol) {
      if (!symbol) return null;
      return META_BY_CODE.get(String(symbol).trim().toUpperCase()) || null;
    },

    async fetchWatchlistQuotes() {
      const now = Date.now();
      if (this._watchlistCache && now < this._watchlistCache.expiresAt) {
        return this._watchlistCache.items;
      }
      if (this._watchlistInflight) {
        return this._watchlistInflight;
      }

      const task = (async () => {
        const secids = ALL_ITEMS.map((it) => it.secid).join(',');
        const fields = 'f2,f3,f5,f12,f14,f15,f16,f17,f18,f23,f115,f441';
        const url = `${EM_ULIST_URL}?fltt=2&fields=${fields}&secids=${encodeURIComponent(secids)}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`东方财富批量行情接口异常 (HTTP ${res.status})`);
        const json = await res.json();
        const diffs = json?.data?.diff || [];

        const rowByEmCode = new Map();
        for (const row of diffs) {
          if (row && row.f12 !== undefined) {
            rowByEmCode.set(String(row.f12).toUpperCase(), row);
          }
        }

        const byCode = new Map();
        const items = ALL_ITEMS.map((meta) => {
          const emCode = meta.secid.split('.')[1].toUpperCase();
          const row = rowByEmCode.get(emCode);

          const prevClose = toFinite(row?.f18) ?? 0.0;
          let price = toFinite(row?.f2);
          if (price === null || price <= 0) price = prevClose;

          let open = toFinite(row?.f17);
          if (open === null || open <= 0) open = price;

          const high = toFinite(row?.f15) ?? price;
          const low = toFinite(row?.f16) ?? price;
          const volume = toFinite(row?.f5) ?? 0.0;

          const f3Val = toFinite(row?.f3);
          const prevCloseChg = f3Val !== null
            ? round2(f3Val)
            : (prevClose > 0 && price > 0 ? round2(((price - prevClose) / prevClose) * 100) : 0.0);

          // 左侧列表沿用开盘实体涨跌幅排序与展示
          const changePct = open > 0 && price > 0
            ? round2(((price - open) / open) * 100)
            : prevCloseChg;

          const val = buildValuation(meta, row, price);
          const cachedKline = this._klineCache.get(meta.code);
          const multiChg = cachedKline?.bars?.length
            ? computeMultiPeriodChanges(cachedKline.bars, price)
            : { chg_3d: null, chg_5d: null, chg_20d: null };

          const item = {
            code: meta.code,
            name: meta.name || String(row?.f14 || meta.code),
            price,
            open,
            change_pct: changePct,
            prev_close_change_pct: prevCloseChg,
            chg_3d: multiChg.chg_3d,
            chg_5d: multiChg.chg_5d,
            chg_20d: multiChg.chg_20d,
            high,
            low,
            volume,
            iopv: val?.iopv ?? null,
            premium_pct: val?.premium_pct ?? null,
            pe_ttm: val?.pe_ttm ?? null,
            pb: val?.pb ?? null,
            valuation: val,
          };
          byCode.set(meta.code, item);
          return item;
        });

        items.sort((a, b) => b.change_pct - a.change_pct);
        this._watchlistCache = {
          expiresAt: Date.now() + QUOTE_CACHE_TTL_MS,
          items,
          byCode,
        };
        return items;
      })();

      this._watchlistInflight = task;
      try {
        return await task;
      } finally {
        if (this._watchlistInflight === task) this._watchlistInflight = null;
      }
    },

    _syncLiveQuoteToBars(bars, quote) {
      if (!bars?.length || !quote || !(quote.price > 0) || !(quote.open > 0)) return false;
      const last = bars[bars.length - 1];
      const sameOpen = last.open > 0 && Math.abs(last.open - quote.open) / quote.open < 1e-4;
      if (!sameOpen) return false;

      const changed = last.close !== quote.price || quote.high > last.high || quote.low < last.low;
      last.close = quote.price;
      last.high = Math.max(last.high, quote.price, quote.high || quote.price);
      last.low = Math.min(last.low, quote.price, quote.low || quote.price);
      if (quote.volume > last.volume) last.volume = quote.volume;
      return changed;
    },

    async getKlineEntry(symbol) {
      const meta = this.getSymbolMeta(symbol);
      if (!meta) throw new Error(`未定义的监控标的: ${symbol}`);

      const now = Date.now();
      const cached = this._klineCache.get(meta.code);
      if (cached && now < cached.historyExpiresAt) {
        if (now >= cached.quoteExpiresAt) {
          try {
            await this.fetchWatchlistQuotes();
            const liveQuote = this._watchlistCache?.byCode?.get(meta.code);
            if (liveQuote && this._syncLiveQuoteToBars(cached.bars, liveQuote)) {
              cached.contexts = calculateAllIndicators(cached.bars);
            }
            cached.quoteExpiresAt = Date.now() + QUOTE_CACHE_TTL_MS;
          } catch (_) {
            // 现价刷新失败时继续使用历史基线
          }
        }
        return cached;
      }

      if (this._klineInflight.has(meta.code)) {
        return this._klineInflight.get(meta.code);
      }

      const task = (async () => {
        const url = `${EM_KLINE_URL}?secid=${encodeURIComponent(meta.secid)}&fields1=f1,f2,f3&fields2=f51,f52,f53,f54,f55,f56&klt=101&fqt=1&end=20500101&lmt=1000`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`东方财富 K 线接口异常 (${meta.code}, HTTP ${res.status})`);
        const json = await res.json();
        const bars = cleanKlineStrings(json?.data?.klines);
        if (bars.length === 0) throw new Error(`未拉取到标的 ${meta.code} 的有效 K 线数据`);

        const liveQuote = this._watchlistCache?.byCode?.get(meta.code);
        if (liveQuote) this._syncLiveQuoteToBars(bars, liveQuote);

        const contexts = calculateAllIndicators(bars);
        const entry = {
          historyExpiresAt: Date.now() + HISTORY_CACHE_TTL_MS,
          quoteExpiresAt: Date.now() + QUOTE_CACHE_TTL_MS,
          bars,
          contexts,
        };
        this._klineCache.set(meta.code, entry);

        if (liveQuote) {
          const multiChg = computeMultiPeriodChanges(bars, liveQuote.price || bars[bars.length - 1].close);
          Object.assign(liveQuote, multiChg);
        }

        return entry;
      })();

      this._klineInflight.set(meta.code, task);
      try {
        return await task;
      } finally {
        if (this._klineInflight.get(meta.code) === task) {
          this._klineInflight.delete(meta.code);
        }
      }
    },

    async getKlinePayload(symbol, { days = 90 } = {}) {
      const meta = this.getSymbolMeta(symbol);
      if (!meta) throw new Error(`未定义的监控标的: ${symbol}`);

      const entry = await this.getKlineEntry(meta.code);
      let bars = entry.bars;
      let contexts = entry.contexts;

      const cap = days > 0 ? Math.max(1, Math.round(days)) : bars.length;
      if (bars.length > cap) {
        const sliceStart = bars.length - cap;
        bars = bars.slice(sliceStart);
        contexts = contexts.slice(sliceStart);
      }

      const candles = bars.map((b) => ({
        time: b.time_sec,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      }));

      const indicators = {
        ema_fast: formatSeriesForTv(contexts, 'ema_fast'),
        ema_slow: formatSeriesForTv(contexts, 'ema_slow'),
        donchian_upper: formatSeriesForTv(contexts, 'donchian_upper_55'),
        donchian_lower: formatSeriesForTv(contexts, 'donchian_lower_20'),
        donchian_mid: formatSeriesForTv(contexts, 'donchian_mid'),
        rsi: formatSeriesForTv(contexts, 'rsi'),
        macd_hist: formatSeriesForTv(contexts, 'macd_hist'),
        td9_markers: formatTd9Markers(contexts),
        rsi_div_markers: formatRsiDivergenceMarkers(contexts),
        donchian_markers: formatDonchianMarkers(contexts),
      };

      const indicatorContexts = {};
      for (const ctx of contexts) {
        indicatorContexts[ctx.timestamp] = ctx;
      }

      const liveQuote = this._watchlistCache?.byCode?.get(meta.code);

      return {
        candles,
        indicators,
        indicator_snapshot: contexts.length ? contexts[contexts.length - 1] : {},
        indicator_contexts: indicatorContexts,
        valuation: liveQuote?.valuation ?? null,
      };
    },

    async scanRecentSignals({ lookback = 3 } = {}) {
      const hits = {};
      await runWithConcurrency(ALL_ITEMS, MAX_SCAN_CONCURRENCY, async (meta) => {
        try {
          const entry = await this.getKlineEntry(meta.code);
          const alerts = extractRecentAlerts(entry.contexts, lookback);
          if (alerts.length > 0) hits[meta.code.toUpperCase()] = alerts;
        } catch (_) {
          // 单个标的网络抖动时跳过，不阻塞其余标的扫描
        }
      });
      return hits;
    },
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MarketClient;
  }
  global.MarketClient = MarketClient;
})(typeof window !== 'undefined' ? window : globalThis);

