/**
 * LemonCyan Quant Terminal - 终端交互与渲染控制核心 (terminal.js)
 * 收拢工具函数、Alpha 因子配置与文档、TradingView 图表引擎、行情雷达控制及应用生命周期。
 */

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 1: 内部格式化与判定工具函数
  // ═══════════════════════════════════════════════════════════════════════════

  function formatPrice(val) {
    if (val === null || val === undefined || val === '') return '--';
    const n = Number(val);
    if (isNaN(n)) return '--';
    if (Math.abs(n) >= 1000) {
      return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return n.toFixed(Math.abs(n) >= 100 ? 2 : (Math.abs(n) >= 1 ? 3 : 4));
  }

  function fmtVol(v) {
    if (v === null || v === undefined || isNaN(v) || Number(v) === 0) return '--';
    const n = Number(v);
    const abs = Math.abs(n);
    if (abs >= 1e8) return `${(n / 1e8).toFixed(2)}亿`;
    if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    if (abs >= 1e4) return `${(n / 1e4).toFixed(1)}万`;
    if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return n.toFixed(1);
  }

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  function fmtV(v, p = 2) {
    return (v !== null && v !== undefined && !isNaN(v)) ? Number(v).toFixed(p) : '--';
  }

  function fmtPct(v, p = 2) {
    if (v === null || v === undefined || isNaN(v)) return '--';
    const n = Number(v) * 100;
    return `${n >= 0 ? '+' : ''}${n.toFixed(p)}%`;
  }

  function fmtPctDirect(v, p = 2) {
    if (v === null || v === undefined || isNaN(v)) return '--';
    const n = Number(v);
    return `${n > 0 ? '+' : ''}${n.toFixed(p)}%`;
  }

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function toNumOrNaN(v) {
    if (v === null || v === undefined || v === '') return NaN;
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }

  function fmtNum(v, p = 4) {
    return (v !== null && v !== undefined && !isNaN(v)) ? Number(v).toFixed(p) : '--';
  }

  function fmtHistSlope(v) {
    if (v === null || v === undefined || isNaN(v)) return { t: '--', pos: false };
    const n = Number(v);
    const abs = Math.abs(n);
    let p = 2;
    if (abs < 0.001) p = 5;
    else if (abs < 0.05) p = 4;
    else if (abs < 1.0) p = 3;
    return { t: `${n >= 0 ? '+' : ''}${n.toFixed(p)}`, pos: n >= 0 };
  }

  function mapTriState(val, pos, neg, mid) {
    return val === 1 ? pos : (val === -1 ? neg : mid);
  }

  function formatAxisDate(time) {
    if (time === null || time === undefined || time === '') return '--';
    let year, month, day;
    if (typeof time === 'number') {
      const d = new Date(time * 1000);
      year = d.getUTCFullYear();
      month = d.getUTCMonth() + 1;
      day = d.getUTCDate();
    } else if (time instanceof Date) {
      year = time.getFullYear();
      month = time.getMonth() + 1;
      day = time.getDate();
    } else if (typeof time === 'object' && time.year && time.month && time.day) {
      year = time.year;
      month = time.month;
      day = time.day;
    } else if (typeof time === 'string') {
      const match = time.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
      if (match) {
        year = parseInt(match[1], 10);
        month = parseInt(match[2], 10);
        day = parseInt(match[3], 10);
      } else {
        const d = new Date(time);
        if (!isNaN(d.getTime())) {
          year = d.getFullYear();
          month = d.getMonth() + 1;
          day = d.getDate();
        } else {
          return time;
        }
      }
    } else {
      return String(time);
    }
    const yy = String(year).slice(-2);
    return `${yy}/${month}/${day}`;
  }

  const isValidNum = (v) => v !== null && v !== undefined && v !== '' && !isNaN(Number(v));

  function premiumClass(prem) {
    if (prem >= 5.0) return 'c-rose';
    if (prem >= 2.5) return 'c-amber';
    return prem < 0 ? 'c-emerald' : 'c-muted';
  }

  function premiumTone(prem) {
    if (prem >= 2.5) return { cls: 'c-amber', tag: ' ⚠️溢' };
    if (prem <= -1.0) return { cls: 'c-emerald', tag: ' 🏷️折' };
    return { cls: '', tag: '' };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 2: 12 大 Alpha 因子副图配置与量化知识库
  // ═══════════════════════════════════════════════════════════════════════════

  const ALPHA_SUB_FACTORS = {
    roc_34: {
      name: 'ROC(34)',
      color: '#38bdf8',
      zeroCenter: true,
      fmt: (v) => fmtPct(v, 2),
    },
    stoch_d_21: {
      name: 'Stoch-D(21)',
      color: '#fbbf24',
      zeroCenter: true,
      fmt: (v) => fmtNum(v, 3),
    },
    garman_klass_vol_14: {
      name: 'GK-Vol(14)',
      color: '#f43f5e',
      zeroCenter: false,
      fmt: (v) => fmtNum(v, 4),
    },
    realized_vol_10: {
      name: 'Realized-Vol(10)',
      color: '#e879f9',
      zeroCenter: false,
      fmt: (v) => fmtNum(v, 4),
    },
    boll_bandwidth_20: {
      name: 'Bandwidth(20)',
      color: '#c084fc',
      zeroCenter: false,
      fmt: (v) => fmtNum(v, 4),
    },
    boll_pct_b_20: {
      name: '%B(20)',
      color: '#818cf8',
      zeroCenter: false,
      fmt: (v) => fmtNum(v, 3),
    },
    mfi_14: {
      name: 'MFI(14)',
      color: '#34d399',
      zeroCenter: false,
      fmt: (v) => fmtNum(v, 1),
    },
    cmf_40: {
      name: 'CMF(40)',
      color: '#22d3ee',
      zeroCenter: true,
      fmt: (v) => fmtNum(v, 4),
    },
    spread_ema_144: {
      name: 'Bias-144',
      color: '#4ade80',
      zeroCenter: true,
      fmt: (v) => fmtPct(v, 2),
    },
    spread_ema_200: {
      name: 'Bias-200',
      color: '#2dd4bf',
      zeroCenter: true,
      fmt: (v) => fmtPct(v, 2),
    },
    ema_ratio_21_55: {
      name: 'EMA 21/55',
      color: '#a5b4fc',
      zeroCenter: true,
      fmt: (v) => fmtPct(v, 2),
    },
    macd_hist_slow: {
      name: '慢速MACD柱',
      color: '#fb923c',
      zeroCenter: true,
      fmt: (v) => fmtNum(v, 5),
    },
  };

  const ALPHA_FACTOR_GROUPS = [
    { title: '1. 长动量 (ROC)', color: '#38bdf8', factors: ['roc_34', 'stoch_d_21'] },
    { title: '2. 极值微观波动', color: '#f43f5e', factors: ['garman_klass_vol_14', 'realized_vol_10'] },
    { title: '3. 布林通道挤压', color: '#a855f7', factors: ['boll_bandwidth_20', 'boll_pct_b_20'] },
    { title: '4. 资金流动量', color: '#10b981', factors: ['mfi_14', 'cmf_40'] },
    { title: '5. 趋势偏离度', color: '#14b8a6', factors: ['spread_ema_144', 'spread_ema_200'] },
    { title: '6. 剪刀差动能', color: '#6366f1', factors: ['ema_ratio_21_55', 'macd_hist_slow'] },
  ];

  const FACTOR_DOCS = (typeof window !== 'undefined' && window.QUANT_FACTOR_DOCS) || {};

  function renderFactorPopoverGrid() {
    const grid = document.getElementById('factorPopGrid');
    if (!grid) return;
    grid.innerHTML = ALPHA_FACTOR_GROUPS.map((group) => `
      <div class="factor-group-card">
        <div class="factor-group-title" style="color:${group.color};">${group.title}</div>
        <div class="factor-chip-row">${group.factors.map((key) => {
          const meta = ALPHA_SUB_FACTORS[key];
          return `
            <div class="factor-chip" data-action="toggleFactor" data-factor="${key}" id="factor_chip_${key}">
              <span class="factor-chip-dot" style="background:${meta.color};"></span>
              <span class="factor-chip-name">${meta.name}</span>
            </div>
          `;
        }).join('')}</div>
      </div>
    `).join('');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 3: TradingView Lightweight Charts 图表控制器
  // ═══════════════════════════════════════════════════════════════════════════

  const ChartController = {
    mainChart: null,
    subChart1: null,
    candleSeries: null,
    sub1BaseSeries: null,
    mainLineSeries: {},
    sub1SeriesMap: {},
    sub1FactorSeries: {},
    candleCloseMap: new Map(),
    indicatorContextsMap: new Map(),
    rawData: null,
    lastHoverTime: null,
    isCrosshairSyncing: false,
    isTimeSyncing: false,

    init() {
      renderFactorPopoverGrid();

      const mainContainer = document.getElementById('tv_chart');
      const subContainer = document.getElementById('tv_sub1');
      if (!mainContainer || !subContainer) return;

      const commonOptions = {
        layout: {
          background: { color: '#0b0e14' },
          textColor: '#8492a6',
          fontFamily: 'Inter, sans-serif',
          fontSize: 11,
        },
        localization: {
          locale: 'zh-CN',
          dateFormat: 'yyyy-MM-dd',
          timeFormatter: (time) => formatAxisDate(time),
        },
        grid: {
          vertLines: { color: '#161d2a' },
          horzLines: { color: '#161d2a' },
        },
        crosshair: {
          mode: LightweightCharts.CrosshairMode.Normal,
          vertLine: { color: '#38bdf8', width: 1, style: 3, labelBackgroundColor: '#181f2c' },
          horzLine: { color: '#38bdf8', width: 1, style: 3, labelBackgroundColor: '#181f2c' },
        },
        leftPriceScale: { visible: false },
        rightPriceScale: {
          visible: true,
          borderColor: '#232b3b',
          minimumWidth: 78,
        },
        timeScale: {
          borderColor: '#232b3b',
          timeVisible: false,
          secondsVisible: false,
          rightOffset: 6,
          barSpacing: 6,
          minBarSpacing: 0.5,
          tickMarkFormatter: (time) => formatAxisDate(time),
        },
      };

      this.mainChart = LightweightCharts.createChart(mainContainer, {
        ...commonOptions,
        rightPriceScale: {
          ...commonOptions.rightPriceScale,
          scaleMargins: { top: 0.02, bottom: 0.01 },
          autoScale: true,
        },
      });

      this.candleSeries = this.mainChart.addCandlestickSeries({
        upColor: '#089981',
        downColor: '#f23645',
        borderUpColor: '#089981',
        borderDownColor: '#f23645',
        wickUpColor: '#089981',
        wickDownColor: '#f23645',
      });

      this.subChart1 = LightweightCharts.createChart(subContainer, {
        ...commonOptions,
        rightPriceScale: {
          ...commonOptions.rightPriceScale,
          scaleMargins: { top: 0.1, bottom: 0.1 },
        },
      });

      this.sub1BaseSeries = this.subChart1.addLineSeries({
        color: 'rgba(0, 0, 0, 0)',
        lineWidth: 1,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: false,
        autoscaleInfoProvider: () => null,
      });

      this.setupTimeSync();
      this.setupCrosshair();
      this.setupResizeObserver();
    },

    setupTimeSync() {
      const syncRange = (source, target) => {
        source.timeScale().subscribeVisibleLogicalRangeChange((range) => {
          if (this.isTimeSyncing || !range) return;
          this.isTimeSyncing = true;
          target.timeScale().setVisibleLogicalRange(range);
          requestAnimationFrame(() => {
            this.isTimeSyncing = false;
          });
        });
      };
      syncRange(this.mainChart, this.subChart1);
      syncRange(this.subChart1, this.mainChart);
    },

    setupCrosshair() {
      const syncCross = (src, tgt, isSrcMain) => {
        src.subscribeCrosshairMove((param) => {
          if (this.isCrosshairSyncing) return;
          this.isCrosshairSyncing = true;
          try {
            const time = param && param.time ? param.time : null;
            if (!time) {
              tgt.clearCrosshairPosition();
            } else {
              const targetSeries = isSrcMain ? this.sub1BaseSeries : this.candleSeries;
              if (targetSeries) {
                let price = 0;
                if (!isSrcMain && this.candleCloseMap.has(time)) {
                  price = this.candleCloseMap.get(time) ?? 0;
                }
                tgt.setCrosshairPosition(price, time, targetSeries);
              }
            }

            if (time && this.candleCloseMap.has(time)) {
              MarketController.replayAllIndicators(time, formatAxisDate(time));
              this.updateSubChartLegend(time);
            } else if (!time) {
              const candles = this.rawData?.candles;
              if (candles?.length) {
                this.updateSubChartLegend(candles[candles.length - 1].time);
              }
              MarketController.restoreLiveIndicators();
            }
          } catch (e) {
            console.warn('Crosshair sync error:', e);
          } finally {
            this.isCrosshairSyncing = false;
          }
        });
      };

      syncCross(this.mainChart, this.subChart1, true);
      syncCross(this.subChart1, this.mainChart, false);

      [document.getElementById('tv_chart'), document.getElementById('tv_sub1')].forEach((w) => {
        if (!w) return;
        w.addEventListener('mouseleave', () => {
          if (this.mainChart) this.mainChart.clearCrosshairPosition();
          if (this.subChart1) this.subChart1.clearCrosshairPosition();
          const candles = this.rawData?.candles;
          if (candles?.length) {
            this.updateSubChartLegend(candles[candles.length - 1].time);
          }
          MarketController.restoreLiveIndicators();
        });
      });
    },

    render(data) {
      if (!data || !this.mainChart) return;
      this.rawData = data;

      const candles = data.candles || [];
      this.candleCloseMap.clear();
      candles.forEach((c) => {
        this.candleCloseMap.set(c.time, c.close);
      });

      this.indicatorContextsMap.clear();
      if (data.indicator_contexts) {
        Object.entries(data.indicator_contexts).forEach(([k, ctx]) => {
          this.indicatorContextsMap.set(Number(k), ctx);
        });
      }

      this.candleSeries.setData(candles);
      const baseTimeline = candles.map((c) => ({ time: c.time, value: 0 }));
      if (this.sub1BaseSeries) this.sub1BaseSeries.setData(baseTimeline);

      this.renderMainLines(data.indicators);
      this.renderSubIndicators(data.indicators);

      this.mainChart.timeScale().fitContent();
      const range = this.mainChart.timeScale().getVisibleLogicalRange();
      if (range && this.subChart1) {
        this.subChart1.timeScale().setVisibleLogicalRange(range);
      }

      this.refreshMarkers();
    },

    renderMainLines(indicators) {
      if (!indicators || !this.mainChart) return;
      Object.values(this.mainLineSeries).forEach((s) => {
        try { this.mainChart.removeSeries(s); } catch (_) {}
      });
      this.mainLineSeries = {};

      const addLine = (key, data, color, options = {}) => {
        if (!data || !data.length) return;
        const s = this.mainChart.addLineSeries({
          color,
          lineWidth: 2,
          visible: true,
          lastValueVisible: false,
          priceLineVisible: false,
          autoscaleInfoProvider: () => null,
          ...options,
        });
        s.setData(data);
        this.mainLineSeries[key] = s;
      };

      const layer = App.state.layerVisible;
      if (layer.EMA !== false) {
        addLine('ema_fast', indicators.ema_fast, '#ffb74d');
        addLine('ema_slow', indicators.ema_slow, '#e040fb');
      }

      const dashedStyle = LightweightCharts.LineStyle?.Dashed ?? 2;
      const dottedStyle = LightweightCharts.LineStyle?.Dotted ?? 1;
      if (layer.Donchian !== false) {
        addLine('donchian_upper', indicators.donchian_upper, '#2dd4bf', {
          lineWidth: 1.5,
          lineStyle: dashedStyle,
        });
        addLine('donchian_mid', indicators.donchian_mid, 'rgba(148, 163, 184, 0.65)', {
          lineWidth: 1,
          lineStyle: dottedStyle,
        });
        addLine('donchian_lower', indicators.donchian_lower, '#fb7185', {
          lineWidth: 1.5,
          lineStyle: dashedStyle,
        });
      }
    },

    renderSubIndicators(indicators) {
      if (!this.subChart1) return;

      Object.values(this.sub1SeriesMap).forEach((s) => {
        try { this.subChart1.removeSeries(s); } catch (_) {}
      });
      this.sub1SeriesMap = {};

      Object.values(this.sub1FactorSeries).forEach((s) => {
        try { this.subChart1.removeSeries(s); } catch (_) {}
      });
      this.sub1FactorSeries = {};

      const layer = App.state.layerVisible;
      const isMacdVisible = layer.MACD !== false;
      const isRsiVisible = layer.RSI !== false;

      this.subChart1.priceScale('right').applyOptions({
        scaleMargins: { top: 0.10, bottom: 0.10 },
        visible: true,
        borderVisible: true,
        borderColor: '#232b3b',
      });

      if (indicators && indicators.rsi && indicators.rsi.length) {
        const rsi = this.subChart1.addLineSeries({
          priceScaleId: 'right',
          color: '#e040fb',
          lineWidth: 1.5,
          visible: isRsiVisible,
          lastValueVisible: isRsiVisible,
          priceLineVisible: false,
          priceFormat: { type: 'price', precision: 1, minMove: 0.1 },
          autoscaleInfoProvider: () => ({
            priceRange: { minValue: 0, maxValue: 100 },
          }),
        });
        rsi.setData(indicators.rsi);
        this.sub1SeriesMap.rsi = rsi;
      }

      if (indicators && indicators.macd_hist && indicators.macd_hist.length) {
        const hist = this.subChart1.addHistogramSeries({
          priceScaleId: 'macd_hist_scale',
          priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
          lastValueVisible: false,
          priceLineVisible: false,
          visible: isMacdVisible,
          autoscaleInfoProvider: this._makeZeroCenteredAutoscale(1.15),
        });
        hist.priceScale().applyOptions({
          scaleMargins: { top: 0.10, bottom: 0.10 },
          visible: false,
        });
        hist.setData(indicators.macd_hist.map((i) => ({
          time: i.time,
          value: i.value,
          color: i.value >= 0 ? 'rgba(41, 182, 246, 0.35)' : 'rgba(255, 167, 38, 0.35)',
        })));
        this.sub1SeriesMap.macd_hist = hist;
      }

      Object.entries(App.state.activeFactors).forEach(([factorKey, isActive]) => {
        if (isActive) this._createFactorSeries(factorKey);
      });

      this.syncFactorUIState();

      const candles = this.rawData?.candles || [];
      if (candles.length) {
        this.updateSubChartLegend(candles[candles.length - 1].time);
      }
    },

    refreshMarkers() {
      if (!this.candleSeries) return;
      const inds = this.rawData?.indicators;
      const layer = App.state.layerVisible;
      const markers = [
        ...(layer.TD9 !== false && inds?.td9_markers ? inds.td9_markers : []),
        ...(layer.RSIDiv !== false && inds?.rsi_div_markers ? inds.rsi_div_markers : []),
        ...(layer.Donchian !== false && inds?.donchian_markers ? inds.donchian_markers : []),
      ].sort((a, b) => Number(a.time) - Number(b.time));
      this.candleSeries.setMarkers(markers);
    },

    toggleLayer(key) {
      const layer = App.state.layerVisible;
      layer[key] = !layer[key];
      const chip = document.getElementById('chip_' + key);
      if (chip) chip.classList.toggle('active', layer[key]);

      if (key === 'TD9' || key === 'RSIDiv') {
        this.refreshMarkers();
        return;
      }

      if (this.rawData && this.rawData.indicators) {
        this.renderMainLines(this.rawData.indicators);
      }
      if (key === 'Donchian') {
        this.refreshMarkers();
      }
    },

    toggleSubLayer(key) {
      const layer = App.state.layerVisible;
      layer[key] = !layer[key];
      const chip = document.getElementById('subchip_' + key);
      if (chip) chip.classList.toggle('active', layer[key]);

      if (key === 'MACD') {
        const vis = layer.MACD !== false;
        if (this.sub1SeriesMap.macd_hist) {
          this.sub1SeriesMap.macd_hist.applyOptions({ visible: vis });
        }
      } else if (key === 'RSI') {
        const vis = layer.RSI !== false;
        if (this.sub1SeriesMap.rsi) {
          this.sub1SeriesMap.rsi.applyOptions({ visible: vis, lastValueVisible: vis });
        }
      }
      this.updateSubChartLegend(this.lastHoverTime);
    },

    toggleFactorPopover() {
      const pop = document.getElementById('factorSelectorPopover');
      const trigger = document.getElementById('subchip_Factors');
      if (!pop) return;
      const isHidden = pop.style.display === 'none' || !pop.style.display;
      pop.style.display = isHidden ? 'block' : 'none';
      if (trigger) trigger.classList.toggle('open', isHidden);
    },

    _makeZeroCenteredAutoscale(margin = 1.15) {
      return (original) => {
        const res = original ? original() : null;
        if (!res || !res.priceRange) return res;
        const min = res.priceRange.minValue;
        const max = res.priceRange.maxValue;
        if (min === undefined || max === undefined || isNaN(min) || isNaN(max)) return res;
        const maxAbs = Math.max(Math.abs(min), Math.abs(max), 0.0001);
        return {
          priceRange: { minValue: -maxAbs * margin, maxValue: maxAbs * margin },
        };
      };
    },

    _createFactorSeries(factorKey) {
      const meta = ALPHA_SUB_FACTORS[factorKey];
      if (!meta || !this.subChart1) return null;

      if (this.sub1FactorSeries[factorKey]) {
        try { this.subChart1.removeSeries(this.sub1FactorSeries[factorKey]); } catch (_) {}
        delete this.sub1FactorSeries[factorKey];
      }

      const candles = this.rawData?.candles || [];
      const factorData = [];
      for (let i = 0; i < candles.length; i++) {
        const t = candles[i].time;
        const ctx = this.indicatorContextsMap.get(Number(t));
        if (ctx && ctx[factorKey] !== undefined && ctx[factorKey] !== null && !isNaN(ctx[factorKey])) {
          factorData.push({ time: t, value: Number(ctx[factorKey]) });
        }
      }
      if (!factorData.length) return null;

      const scaleId = 'scale_' + factorKey;
      const s = this.subChart1.addLineSeries({
        priceScaleId: scaleId,
        color: meta.color,
        lineWidth: 1.5,
        visible: true,
        lastValueVisible: false,
        priceLineVisible: false,
        crosshairMarkerVisible: true,
        autoscaleInfoProvider: meta.zeroCenter ? this._makeZeroCenteredAutoscale(1.15) : undefined,
      });
      this.subChart1.priceScale(scaleId).applyOptions({
        visible: false,
        autoScale: true,
        scaleMargins: { top: 0.10, bottom: 0.10 },
      });
      s.setData(factorData);
      this.sub1FactorSeries[factorKey] = s;
      return s;
    },

    toggleFactor(factorKey) {
      const meta = ALPHA_SUB_FACTORS[factorKey];
      if (!meta || !this.subChart1) return;

      const activeFactors = App.state.activeFactors;
      activeFactors[factorKey] = !activeFactors[factorKey];

      if (activeFactors[factorKey]) {
        this._createFactorSeries(factorKey);
      } else if (this.sub1FactorSeries[factorKey]) {
        try { this.subChart1.removeSeries(this.sub1FactorSeries[factorKey]); } catch (_) {}
        delete this.sub1FactorSeries[factorKey];
      }

      this.syncFactorUIState();
      this.updateSubChartLegend(this.lastHoverTime);
    },

    clearAllFactors() {
      if (!this.subChart1) return;
      Object.values(this.sub1FactorSeries).forEach((s) => {
        try { this.subChart1.removeSeries(s); } catch (_) {}
      });
      this.sub1FactorSeries = {};
      App.state.activeFactors = {};

      this.syncFactorUIState();
      this.updateSubChartLegend(this.lastHoverTime);
    },

    syncFactorUIState() {
      const activeFactors = App.state.activeFactors;
      const count = Object.values(activeFactors).filter(Boolean).length;

      Object.keys(ALPHA_SUB_FACTORS).forEach((k) => {
        const chip = document.getElementById('factor_chip_' + k);
        if (chip) chip.classList.toggle('active', !!activeFactors[k]);
      });

      const badge = document.getElementById('factorActiveCount');
      if (badge) badge.textContent = count;
      const trigger = document.getElementById('subchip_Factors');
      if (trigger) {
        trigger.classList.toggle('has-active', count > 0);
        trigger.classList.toggle('active', count > 0);
      }
    },

    updateSubChartLegend(time) {
      const el = document.getElementById('subChartLegend');
      if (!el) return;

      if (time !== undefined && time !== null) {
        this.lastHoverTime = time;
      } else if (this.lastHoverTime !== null) {
        time = this.lastHoverTime;
      } else if (this.rawData?.candles?.length) {
        time = this.rawData.candles[this.rawData.candles.length - 1].time;
        this.lastHoverTime = time;
      }

      if (!time) {
        el.innerHTML = '';
        return;
      }

      const ctx = this.indicatorContextsMap.get(Number(time));
      const layer = App.state.layerVisible;
      const items = [];

      if (layer.MACD !== false) {
        const histVal = ctx ? ctx.macd_hist : null;
        if (histVal !== null && histVal !== undefined && !isNaN(histVal)) {
          const n = Number(histVal);
          const col = n >= 0 ? '#38bdf8' : '#ffa726';
          const txt = (n >= 0 ? '+' : '') + n.toFixed(3);
          items.push(`<span class="sub-leg-item"><span class="sub-leg-dot" style="background:${col};"></span><span class="sub-leg-lbl">MACD柱:</span><span class="sub-leg-val font-mono" style="color:${col};">${txt}</span></span>`);
        }
      }

      if (layer.RSI !== false) {
        const rsiVal = ctx ? ctx.rsi : null;
        if (rsiVal !== null && rsiVal !== undefined && !isNaN(rsiVal)) {
          items.push(`<span class="sub-leg-item"><span class="sub-leg-dot" style="background:#e040fb;"></span><span class="sub-leg-lbl">RSI(12):</span><span class="sub-leg-val font-mono" style="color:#e040fb;">${Number(rsiVal).toFixed(1)}</span></span>`);
        }
      }

      Object.entries(App.state.activeFactors).forEach(([k, isActive]) => {
        if (!isActive) return;
        const meta = ALPHA_SUB_FACTORS[k];
        if (!meta) return;
        const v = ctx ? ctx[k] : null;
        const txt = (v !== null && v !== undefined && !isNaN(v)) ? meta.fmt(v) : '--';
        items.push(`<span class="sub-leg-item"><span class="sub-leg-dot" style="background:${meta.color};"></span><span class="sub-leg-lbl">${meta.name}:</span><span class="sub-leg-val font-mono" style="color:${meta.color};">${txt}</span></span>`);
      });

      el.innerHTML = items.join('');
    },

    resize() {
      const mainEl = document.getElementById('tv_chart');
      const subEl = document.getElementById('tv_sub1');
      // 宽高都要 > 0 才重排：容器被折叠/隐藏时 applyOptions(0) 会让图表彻底塌掉，
      // 而不会在下次显示时自动恢复。
      if (this.mainChart && mainEl && mainEl.clientWidth > 0 && mainEl.clientHeight > 0) {
        this.mainChart.applyOptions({ width: mainEl.clientWidth, height: mainEl.clientHeight });
      }
      if (this.subChart1 && subEl && subEl.clientWidth > 0 && subEl.clientHeight > 0) {
        this.subChart1.applyOptions({ width: subEl.clientWidth, height: subEl.clientHeight });
      }
    },

    // 修复「拖动窗口缩放 / 点展开后 K 线主图不跟着变尺寸」：
    // 之前只在 window.resize 上挂了一个节流回调，但 quant 是嵌在 .app-window 里的，
    // 拖窗口右下角缩放、点展开/还原、切换最小化都只改 .app-window 的尺寸，
    // window 本身尺寸没变 → 永远不触发 resize 事件 → 画布停在旧尺寸。
    // 这里改用 ResizeObserver 直接盯绘图容器自己的盒子：不管是哪种原因导致容器
    // 变胖变瘦都会通知，与触发原因完全解耦，也不会漏掉 CSS 驱动的布局变化。
    setupResizeObserver() {
      if (typeof ResizeObserver === 'undefined') return;
      if (this._sizeObserver) return;

      const targets = [
        document.getElementById('tv_chart'),
        document.getElementById('tv_sub1'),
      ].filter(Boolean);
      if (!targets.length) return;

      // 记住上一次生效的盒子尺寸：ResizeObserver 首帧必然回调一次，
      // 且 applyOptions 之后仍可能再来一次，靠它把「尺寸真变了」筛出来，
      // 避免反复重排（重排会重置时间轴右侧留白，肉眼表现为图来回抖）。
      this._lastBox = new Map();
      let raf = 0;

      const flush = () => {
        raf = 0;
        this.resize();
      };

      this._sizeObserver = new ResizeObserver((entries) => {
        let changed = false;
        for (const entry of entries) {
          const box = entry.contentRect;
          const w = Math.round(box.width);
          const h = Math.round(box.height);
          const prev = this._lastBox.get(entry.target);
          if (!prev || prev.w !== w || prev.h !== h) {
            this._lastBox.set(entry.target, { w, h });
            changed = true;
          }
        }
        if (!changed) return;
        // 拖拽缩放时每帧都会回调，用 rAF 合并成一帧一次重排
        if (!raf) raf = requestAnimationFrame(flush);
      });

      targets.forEach((el) => this._sizeObserver.observe(el));
    },
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 4: 行情列表、右侧指标雷达与因子说明浮窗控制器
  // ═══════════════════════════════════════════════════════════════════════════

  const MarketController = {
    watchlistItems: [],
    watchlistPollingTimer: null,
    _isScanning: false,
    signalMap: {},
    domCached: false,
    dom: null,
    indicatorContexts: {},
    lastLiveSnapshot: null,
    lastLiveValuation: null,
    isReplaying: false,
    lastReplayedTime: null,

    async init() {
      await this.loadWatchlistQuotes();
      this.startWatchlistPolling();
    },

    getSymbolMeta(symbol) {
      if (!symbol) return null;
      const clean = symbol.trim().toUpperCase();
      return this.watchlistItems.find((i) => i.code && i.code.toUpperCase() === clean) || null;
    },

    async loadWatchlistQuotes() {
      try {
        this.watchlistItems = await window.MarketClient.fetchWatchlistQuotes();
        this.renderSidebarList();
        this.fetchSignalsInBackground();
      } catch (e) {
        console.warn('Watchlist 行情更新异常:', e);
      }
    },

    renderSidebarList() {
      const container = document.getElementById('sidebarList');
      if (!container) return;

      const list = this.watchlistItems.slice().sort((a, b) => num(b.change_pct) - num(a.change_pct));
      if (list.length === 0) {
        container.innerHTML = '<div class="panel-empty-tip">暂无标的</div>';
        return;
      }

      const currentSym = (App.state.symbol || '').toUpperCase();
      container.innerHTML = list.map((item) => {
        const symStr = item.code || '';
        const symKey = symStr.toUpperCase();
        const isActive = symKey === currentSym;

        const chgVal = num(item.change_pct);
        const pillClass = chgVal > 0 ? 'card-change-pill pos' : (chgVal < 0 ? 'card-change-pill neg' : 'card-change-pill zero');
        const priceText = formatPrice(num(item.price));
        const fmtChg = fmtPctDirect(chgVal);
        const displayName = item.name || symStr;
        const prevChgVal = toNumOrNaN(item.prev_close_change_pct);
        const pillTip = !isNaN(prevChgVal)
          ? `日内实体走势 (基准今开): ${fmtChg}&#10;相对昨收实际涨跌: ${fmtPctDirect(prevChgVal)}`
          : `日内实体走势 (基准今开): ${fmtChg}`;

        let extraTag = '';
        if (item.premium_pct !== null && item.premium_pct !== undefined) {
          const prem = Number(item.premium_pct);
          if (!isNaN(prem) && Math.abs(prem) >= 0.05) {
            extraTag = `<span class="card-tag ${premiumClass(prem)}">${fmtPctDirect(prem)}溢</span>`;
          }
        } else if (isValidNum(item.pe_ttm) && num(item.pe_ttm) > 0) {
          extraTag = `<span class="card-tag c-cyan">PE ${fmtV(item.pe_ttm, 1)}</span>`;
        }

        const symSafe = escapeHtml(symStr);
        const nameSafe = escapeHtml(displayName);

        const signals = this.signalMap[symKey] || [];
        let signalBadgeHtml = '';
        if (signals.length > 0) {
          const latest = signals.reduce((a, b) => (a.bar_offset <= b.bar_offset ? a : b));
          const dir = latest.direction;
          let dirEmoji = '🟢';
          let dirLabel = '多';
          let sigBadgeCls = 'card-signal-badge long';
          if (dir === 'short') { dirEmoji = '🔴'; dirLabel = '空'; sigBadgeCls = 'card-signal-badge short'; }
          else if (dir === 'conflict') { dirEmoji = '⚡'; dirLabel = '冲'; sigBadgeCls = 'card-signal-badge conflict'; }

          const sources = Array.isArray(latest.sources) && latest.sources.length > 0 ? latest.sources : [];
          const srcLabel = sources.length > 0 ? `(${sources.join('+')})` : '';
          const srcTitle = sources.length > 0 ? ` title="触发信号来源: ${escapeHtml(sources.join(', '))}"` : '';
          const barText = latest.bar_offset === 0 ? '最新K线' : `前${latest.bar_offset}根`;
          signalBadgeHtml = `<span class="${sigBadgeCls}"${srcTitle}>${dirEmoji}${dirLabel}${srcLabel} · ${barText}</span>`;
        }

        const renderPeriodTag = (val, lbl, daysText) => {
          if (val === null || val === undefined || isNaN(val)) return '';
          const n = num(val);
          const cls = n > 0 ? 'pos' : (n < 0 ? 'neg' : 'zero');
          const tip = `近${daysText}涨跌幅: ${fmtPctDirect(n)}`;
          return `<span class="card-period-item ${cls}" title="${tip}"><span class="p-lbl">${lbl}</span><span class="p-val">${fmtPctDirect(n, 1)}</span></span>`;
        };

        const tag3d = renderPeriodTag(item.chg_3d, '3d', '3日');
        const tag5d = renderPeriodTag(item.chg_5d, '5d', '5日');
        const tag20d = renderPeriodTag(item.chg_20d, '20d', '20日');
        const multiChgHtml = (tag3d || tag5d || tag20d)
          ? `<div class="card-multi-chg">${tag3d}${tag5d}${tag20d}</div>`
          : '';

        return `
          <div class="symbol-card ${isActive ? 'active' : ''}" data-action="selectSymbol" data-symbol="${symSafe}">
            <div class="card-top-row">
              <div class="card-sym-row">
                <span class="card-sym">${symSafe}</span>
                ${signalBadgeHtml}
                ${extraTag}
              </div>
              <span class="card-price">${priceText}</span>
            </div>
            <div class="card-bottom-row">
              <span class="card-name" title="${nameSafe}">${nameSafe}</span>
              <div class="card-change-row">
                ${multiChgHtml}
                <span class="${pillClass}" title="${pillTip}">${fmtChg}</span>
              </div>
            </div>
          </div>
        `;
      }).join('');
    },

    async fetchKlineAndRender() {
      const seq = ++this._klineSeq;
      const sym = App.state.symbol;
      const days = App.state.days;

      try {
        const data = await window.MarketClient.getKlinePayload(sym, { days });
        if (seq !== this._klineSeq || sym !== App.state.symbol) return;

        ChartController.render(data);
        this.indicatorContexts = data.indicator_contexts || {};
        this.lastLiveSnapshot = data.indicator_snapshot;
        this.lastLiveValuation = data.valuation || null;
        this.isReplaying = false;
        this.lastReplayedTime = null;
        this.renderIndicators(data.indicator_snapshot, data.valuation || null);
      } catch (e) {
        console.error('获取 K 线渲染异常:', e);
      }
    },
    _klineSeq: 0,

    initIndicatorDom() {
      if (this.domCached) return;
      const body = document.getElementById('indicatorsBody');
      if (!body) return;
      this.dom = {
        emptyTip: document.getElementById('indEmptyTip'),
        inds: Object.fromEntries(
          [...body.querySelectorAll('[data-ind]')].map((el) => [el.dataset.ind, el])
        ),
        sym: document.getElementById('indSymbol'),
        modeBadge: document.getElementById('indModeBadge'),
        rowValuation: document.getElementById('rowOverviewValuation'),
        colValPe: document.getElementById('colValPe'),
        colValPb: document.getElementById('colValPb'),
        colValIopv: document.getElementById('colValIopv'),
        colValPremium: document.getElementById('colValPremium'),
        indAlphaBadge: document.getElementById('indAlphaBadge'),
        emaBadge: document.getElementById('emaBadge'),
        donchianBadge: document.getElementById('donchianBadge'),
      };
      this.domCached = true;
    },

    setVal(key, text, colorClass = null) {
      const el = this.dom?.inds[key];
      if (!el) return;
      el.textContent = text ?? '--';
      if (colorClass !== null) {
        el.className = `ind-val font-mono ${colorClass}`;
      }
    },

    _renderValCell(colEl, valKey, hasVal, text, colorClass) {
      if (!colEl) return;
      colEl.hidden = !hasVal;
      if (hasVal) {
        this.setVal(valKey, text, colorClass);
      } else {
        this.setVal(valKey, '--');
      }
    },

    updateValuation(val) {
      this.initIndicatorDom();
      const row = this.dom?.rowValuation;
      if (!row) return;

      const hasIopv = Boolean(val && isValidNum(val.iopv));
      const hasPremium = Boolean(val && isValidNum(val.premium_pct));
      const hasPe = Boolean(val && isValidNum(val.pe_ttm));
      const hasPb = Boolean(val && isValidNum(val.pb));

      this._renderValCell(
        this.dom.colValIopv, 'val_iopv', hasIopv,
        hasIopv ? fmtNum(val.iopv, 4) : '', 'c-cyan fw-bold'
      );

      let premText = '';
      let premCls = '';
      if (hasPremium) {
        const prem = num(val.premium_pct);
        const tone = premiumTone(prem);
        premText = `${fmtPctDirect(prem)}${tone.tag}`;
        premCls = `fw-heavy ${tone.cls}`;
      }
      this._renderValCell(this.dom.colValPremium, 'val_premium', hasPremium, premText, premCls);

      this._renderValCell(
        this.dom.colValPe, 'val_pe', hasPe,
        hasPe ? fmtV(val.pe_ttm, 2) : '', 'c-cyan fw-bold'
      );

      this._renderValCell(
        this.dom.colValPb, 'val_pb', hasPb,
        hasPb ? fmtV(val.pb, 2) : '', 'c-purple fw-bold'
      );

      row.hidden = !(hasIopv || hasPremium || hasPe || hasPb);
    },

    renderIndicators(snapshot, valuation, isReplay = false, timeStr = '') {
      this.initIndicatorDom();
      if (!this.dom) return;

      const ctx = snapshot || null;
      if (!isReplay) {
        this.lastLiveSnapshot = snapshot;
        this.lastLiveValuation = valuation;
      }

      if (!ctx) {
        if (this.dom.emptyTip) this.dom.emptyTip.hidden = false;
        return;
      }
      if (this.dom.emptyTip) this.dom.emptyTip.hidden = true;

      const sym = App.state.symbol || '--';

      const closedPrice = ctx.prev_close || ctx.close;
      const latestPrice = ctx.close;
      let chgPct = (latestPrice !== null && closedPrice !== null && Number(closedPrice) > 0)
        ? ((Number(latestPrice) - Number(closedPrice)) / Number(closedPrice)) * 100
        : (ctx.change_pct !== undefined && ctx.change_pct !== null && !isNaN(ctx.change_pct) ? Number(ctx.change_pct) : null);

      const qItem = (!isReplay && this.watchlistItems)
        ? this.watchlistItems.find((i) => i.code === sym)
        : null;
      if (qItem && !isNaN(toNumOrNaN(qItem.prev_close_change_pct))) {
        chgPct = toNumOrNaN(qItem.prev_close_change_pct);
      }

      const chgPos = chgPct !== null && !isNaN(chgPct) && chgPct >= 0;
      const chgStr = (chgPct !== null && !isNaN(chgPct)) ? fmtPctDirect(chgPct) : '--';

      if (this.dom.sym) this.dom.sym.textContent = sym;
      this.setVal('chg_pct', chgStr, chgPos ? 'pos-text' : 'neg-text');
      if (this.dom.modeBadge) {
        this.dom.modeBadge.textContent = isReplay ? `⏳ 时序回放 (${timeStr || ctx.time_str || ''})` : '⚡ 实时指标';
        this.dom.modeBadge.className = `ind-card-badge ${isReplay ? 'is-replay' : 'bull'}`;
      }

      this.updateValuation(valuation !== undefined ? valuation : this.getSymbolMeta(sym));

      const [rocTxt, rocCls] = mapTriState(ctx.roc_state, ['主升加速 🟢', 'pos-text'], ['主跌加速 🔴', 'neg-text'], ['中性常态 ⚪', 'c-cyan']);
      this.setVal('roc_state', rocTxt, rocCls);
      this.setVal('roc_34', fmtPct(ctx.roc_34), ctx.roc_34 >= 0 ? 'pos-text' : 'neg-text');
      this.setVal('stoch_d_21', fmtNum(ctx.stoch_d_21, 3));

      this.setVal('vol_spike', ctx.vol_spike_flag === 1 ? '波动率爆发 ⚡' : '常态均衡 ⚪', ctx.vol_spike_flag === 1 ? 'c-amber' : 'c-muted');
      this.setVal('gk_vol_14', fmtNum(ctx.garman_klass_vol_14, 4));
      this.setVal('realized_vol_10', fmtNum(ctx.realized_vol_10, 4));

      const bollBreak = mapTriState(ctx.boll_breakout, '放量上轨突破 🚀', '下轨击穿 📉', '通道内运行');
      this.setVal('boll_squeeze', ctx.boll_squeeze === 1 ? '通道极窄挤压 (变盘在即) ⏳' : '常态扩张 ⚪', ctx.boll_squeeze === 1 ? 'c-amber' : 'c-emerald');
      this.setVal('boll_bandwidth_20', fmtNum(ctx.boll_bandwidth_20, 4), 'c-purple');
      this.setVal('boll_pct_b_20', fmtNum(ctx.boll_pct_b_20, 3));
      this.setVal('boll_breakout', `(${bollBreak})`);

      const [mfiTxt, mfiCls] = mapTriState(ctx.mfi_state, ['主力持续净流入 🟢', 'pos-text'], ['主力持续净流出 🔴', 'neg-text'], ['多空均衡 ⚪', 'c-muted']);
      this.setVal('mfi_state', mfiTxt, mfiCls);
      this.setVal('mfi_14', fmtNum(ctx.mfi_14, 1), 'c-emerald fw-bold');
      this.setVal('cmf_40', fmtNum(ctx.cmf_40, 4), ctx.cmf_40 >= 0 ? 'pos-text' : 'neg-text');

      const [trendTxt, trendCls] = mapTriState(ctx.trend_alignment, ['长周期绝对多头 🟢', 'pos-text'], ['长周期绝对空头 🔴', 'neg-text'], ['均线纠缠胶着 ⚪', 'c-muted']);
      this.setVal('trend_align', trendTxt, trendCls);
      this.setVal('spread_ema_144', fmtPct(ctx.spread_ema_144), ctx.spread_ema_144 >= 0 ? 'pos-text' : 'neg-text');
      this.setVal('spread_ema_200', fmtPct(ctx.spread_ema_200), ctx.spread_ema_200 >= 0 ? 'pos-text' : 'neg-text');

      const [scisTxt, scisCls] = mapTriState(ctx.scissors_expansion, ['剪刀差加速扩张 📐', 'c-indigo'], ['空头开口扩大', 'c-muted'], ['收敛常态 ⚪', 'c-muted']);
      this.setVal('scissors_exp', scisTxt, scisCls);
      this.setVal('ema_ratio_21_55', fmtPct(ctx.ema_ratio_21_55), ctx.ema_ratio_21_55 >= 0 ? 'pos-text' : 'neg-text');
      this.setVal('macd_hist_slow', fmtNum(ctx.macd_hist_slow, 5), ctx.macd_hist_slow >= 0 ? 'pos-text' : 'neg-text');

      if (this.dom.indAlphaBadge) {
        this.dom.indAlphaBadge.textContent = isReplay ? `⏳ 历史截面 (${timeStr || ctx.time_str || ''})` : '6 大核心分类';
      }

      const isEmaBull = (ctx.ema_fast && ctx.ema_slow && ctx.ema_fast >= ctx.ema_slow);
      if (this.dom.emaBadge) {
        this.dom.emaBadge.textContent = isEmaBull ? '多头排列' : '空头排列';
        this.dom.emaBadge.className = `ind-card-badge ${isEmaBull ? 'bull' : 'bear'}`;
      }
      const fastVal = (ctx.ema_fast !== undefined && ctx.ema_fast !== null) ? Number(ctx.ema_fast) : null;
      const slowVal = (ctx.ema_slow !== undefined && ctx.ema_slow !== null) ? Number(ctx.ema_slow) : null;
      let emaText = '--', emaEmoji = '', isEmaHigher = false;
      if (fastVal !== null && slowVal !== null && slowVal > 0) {
        const emaChgPct = ((fastVal - slowVal) / slowVal) * 100;
        isEmaHigher = emaChgPct >= 0;
        emaText = isEmaHigher ? `上涨 ${fmtNum(Math.abs(emaChgPct), 2)}%` : `下跌 ${fmtNum(Math.abs(emaChgPct), 2)}%`;
        emaEmoji = isEmaHigher ? '🟢' : '🔴';
      }

      this.setVal('ema_20_60', `${fmtV(fastVal)} / ${fmtV(slowVal)}`);
      this.setVal('ema_change', emaText !== '--' ? `(${emaText} ${emaEmoji})` : '--', isEmaHigher ? 'pos-text' : 'neg-text');

      const v5 = ctx.vol5 !== undefined && ctx.vol5 !== null ? Number(ctx.vol5) : null;
      const v60 = ctx.vol60 !== undefined && ctx.vol60 !== null ? Number(ctx.vol60) : null;
      let volText = '--', volEmoji = '', isVolAmp = false;
      if (v5 !== null && v60 !== null && v60 > 0) {
        const volChgPct = ((v5 - v60) / v60) * 100;
        isVolAmp = volChgPct >= 0;
        volText = isVolAmp ? `放量 ${fmtNum(Math.abs(volChgPct), 1)}%` : `缩量 ${fmtNum(Math.abs(volChgPct), 1)}%`;
        volEmoji = isVolAmp ? '🟢' : '🔴';
      }
      this.setVal('vol_5_60', `${fmtVol(v5)} / ${fmtVol(v60)}`);
      this.setVal('vol_change', volText !== '--' ? `(${volText} ${volEmoji})` : '--', isVolAmp ? 'pos-text' : 'neg-text');

      const buy9 = ctx.td9_buy_setup || 0;
      const sell9 = ctx.td9_sell_setup || 0;
      const perfectBuy = !!ctx.td9_perfect_buy;
      const perfectSell = !!ctx.td9_perfect_sell;
      const td9Tag = perfectBuy ? `完美买 ${buy9} ★🟢` : (perfectSell ? `完美卖 ${sell9} ★🔴` : (buy9 > 0 ? `买 ${buy9} 🟢` : (sell9 > 0 ? `卖 ${sell9} 🔴` : '无计数 ⚪')));
      this.setVal('td9', td9Tag);

      const rsiVal = (ctx.rsi !== undefined && ctx.rsi !== null && !isNaN(ctx.rsi)) ? Number(ctx.rsi) : null;
      const rsiDiv = ctx.rsi_divergence;
      let rsiBadge = '--';
      if (rsiDiv === 1) {
        rsiBadge = '底背离 🚀';
      } else if (rsiDiv === -1) {
        rsiBadge = '顶背离 ⚠️';
      } else if (rsiVal !== null) {
        rsiBadge = (rsiVal >= 70 ? '超买 🔴' : (rsiVal <= 30 ? '超卖 🟢' : (rsiVal >= 50 ? '偏强 🟢' : '偏弱 🔴')));
      }
      this.setVal('rsi', rsiVal !== null ? fmtV(rsiVal, 1) : '--');
      this.setVal('rsi_badge', `(${rsiBadge})`);

      const histVal = (ctx.macd_hist !== undefined && ctx.macd_hist !== null && !isNaN(ctx.macd_hist)) ? Number(ctx.macd_hist) : null;
      const prevHist = (ctx.prev_macd_hist !== undefined && ctx.prev_macd_hist !== null && !isNaN(ctx.prev_macd_hist)) ? Number(ctx.prev_macd_hist) : null;
      if (histVal !== null && prevHist !== null) {
        const slopeVal = histVal - prevHist;
        const slopeObj = fmtHistSlope(slopeVal);
        this.setVal('macd_hist_slope', `${slopeObj.t} ${slopeObj.pos ? '🟢' : '🔴'}`, slopeObj.pos ? 'pos-text' : 'neg-text');
      } else {
        this.setVal('macd_hist_slope', '--');
      }

      const dcUpper = isValidNum(ctx.donchian_upper_55) ? Number(ctx.donchian_upper_55) : null;
      const dcLower = isValidNum(ctx.donchian_lower_20) ? Number(ctx.donchian_lower_20) : null;
      const dcPos = isValidNum(ctx.donchian_pos) ? Number(ctx.donchian_pos) : null;
      const dcSig = Number(ctx.donchian_signal) || 0;
      const atr20Val = isValidNum(ctx.atr_20) ? Number(ctx.atr_20) : null;

      let dcOvText = '预热不足';
      let dcOvCls = 'c-muted';
      let dcBadgeText = '通道预热';
      let dcBadgeCls = 'neutral';
      let dcSigText = '(通道内)';
      let dcSigCls = 'c-muted';

      if (dcSig === 1) {
        dcOvText = '突破55上轨 🚀';
        dcOvCls = 'pos-text';
        dcBadgeText = '突破上轨 🚀';
        dcBadgeCls = 'bull';
        dcSigText = '(突破55入 D 🚀)';
        dcSigCls = 'pos-text';
      } else if (dcSig === -1) {
        dcOvText = '跌破20下轨 ⚠️';
        dcOvCls = 'neg-text';
        dcBadgeText = '跌破下轨 ⚠️';
        dcBadgeCls = 'bear';
        dcSigText = '(跌破20出 D ⚠️)';
        dcSigCls = 'neg-text';
      } else if (dcPos !== null) {
        dcOvText = `通道内 ${(dcPos * 100).toFixed(0)}%`;
        dcOvCls = 'c-cyan';
        dcBadgeText = '通道内运行';
        dcBadgeCls = 'neutral';
        dcSigText = '(通道内运行)';
        dcSigCls = 'c-muted';
      }

      this.setVal('donchian_ov', dcOvText, dcOvCls);
      if (this.dom.donchianBadge) {
        this.dom.donchianBadge.textContent = dcBadgeText;
        this.dom.donchianBadge.className = `ind-card-badge ${dcBadgeCls}`;
      }

      const dcBandsText = (dcUpper !== null || dcLower !== null)
        ? `${dcUpper !== null ? formatPrice(dcUpper) : '--'} / ${dcLower !== null ? formatPrice(dcLower) : '--'}`
        : '--';
      this.setVal('donchian_bands', dcBandsText);

      const dcPosText = dcPos !== null ? `${(dcPos * 100).toFixed(1)}%` : '--';
      const dcPosCls = dcSig === 1 ? 'pos-text' : (dcSig === -1 ? 'neg-text' : (dcPos !== null ? 'c-cyan' : 'c-muted'));
      this.setVal('donchian_pos', dcPosText, dcPosCls);
      this.setVal('donchian_sig', dcSigText, dcSigCls);

      if (atr20Val !== null && atr20Val > 0 && isValidNum(latestPrice)) {
        const stopRef = Math.max(0, Number(latestPrice) - 2.0 * atr20Val);
        this.setVal('donchian_atr', `${formatPrice(atr20Val)} / ${formatPrice(stopRef)}`);
      } else {
        this.setVal('donchian_atr', '--');
      }
    },

    replayAllIndicators(time, timeStr = '') {
      if (!time || !this.indicatorContexts) return;
      if (this.lastReplayedTime === time) return;

      const ctx = this.indicatorContexts[time] || this.indicatorContexts[String(time)];
      if (!ctx) return;

      this.lastReplayedTime = time;
      this.isReplaying = true;
      this.renderIndicators(ctx, this.lastLiveValuation, true, timeStr || ctx.time_str || '');
    },

    restoreLiveIndicators() {
      if (!this.isReplaying) return;
      this.isReplaying = false;
      this.lastReplayedTime = null;
      if (this.lastLiveSnapshot) {
        this.renderIndicators(this.lastLiveSnapshot, this.lastLiveValuation, false, '');
      }
    },

    setDays(days) {
      const nextDays = Number(days) === 300 ? 300 : 90;
      if (App.state.days === nextDays) return;
      App.state.days = nextDays;
      App.syncDaysButtonStates();
      this.fetchKlineAndRender();
    },

    startWatchlistPolling() {
      if (this.watchlistPollingTimer) clearInterval(this.watchlistPollingTimer);
      this.watchlistPollingTimer = setInterval(() => {
        this.loadWatchlistQuotes();
      }, 600000);
    },

    async fetchSignalsInBackground() {
      if (this._isScanning) return;
      this._isScanning = true;
      try {
        const symbols = (this.watchlistItems || []).map((i) => i.code).filter(Boolean);
        if (symbols.length === 0) return;

        const hitMap = await window.MarketClient.scanRecentSignals({ lookback: 3 });

        symbols.forEach((sym) => {
          const key = sym.toUpperCase();
          if (hitMap[key]) {
            this.signalMap[key] = hitMap[key];
          } else {
            delete this.signalMap[key];
          }
        });

        this.renderSidebarList();
      } catch (e) {
        console.debug('批量信号扫描异常:', e);
      } finally {
        this._isScanning = false;
      }
    },
  };

  // ── Alpha 因子与指标量化知识深度浮窗 ──────────────────────────────────────────
  function setupFactorDetailTooltip() {
    let factorTipEl = null;
    let enterTimer = null;
    let leaveTimer = null;

    function hideFactorTooltip() {
      if (enterTimer) {
        clearTimeout(enterTimer);
        enterTimer = null;
      }
      leaveTimer = setTimeout(() => {
        if (factorTipEl) factorTipEl.style.display = 'none';
      }, 120);
    }

    // 浮窗的可用边界：优先 app 窗口，其次 app 宿主，最后回退到视口
    function getTooltipBounds(tip) {
      const winEl = tip.closest('.app-window');
      if (winEl) {
        const r = winEl.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      }
      const hostEl = tip.closest('.app-host');
      if (hostEl) {
        const r = hostEl.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      }
      return { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    }

    // position:fixed 的坐标原点取决于最近的「建立包含块的祖先」：
    // .app-window 带 transform，会把 fixed 坐标系改写到窗口自身（最大化时 transform:none 又变回视口），
    // 这里用一个零尺寸探针实测原点，保证 clamp 与窗口 rect 始终在同一坐标系。
    function getFixedOrigin(mountEl) {
      const probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;visibility:hidden;';
      (mountEl || document.body).appendChild(probe);
      const r = probe.getBoundingClientRect();
      if (probe.parentNode) probe.parentNode.removeChild(probe);
      return { x: r.left, y: r.top };
    }

    function getFactorTip() {
      if (!factorTipEl) {
        factorTipEl = document.createElement('div');
        factorTipEl.id = 'factorDetailTooltip';
        factorTipEl.className = 'alpha-factor-tooltip';
        // 挂到本 app 自己的内容宿主上，跟随窗口（窗口化/最大化时不会脱离窗口边框）。
        // 从本 app 的宿主容器往上找，避免多窗口时拿到别的 app 的 .app-host。
        const anchorEl = document.getElementById('indicatorsBody');
        const mountEl =
          (anchorEl && anchorEl.closest('.app-host')) ||
          document.querySelector('.app-host') ||
          document.body;
        mountEl.appendChild(factorTipEl);

        factorTipEl.addEventListener('mouseenter', () => {
          if (leaveTimer) {
            clearTimeout(leaveTimer);
            leaveTimer = null;
          }
        });
        factorTipEl.addEventListener('mouseleave', hideFactorTooltip);
      }
      return factorTipEl;
    }

    function showFactorTooltip(targetEl, doc) {
      if (!doc) return;
      const tip = getFactorTip();
      tip.innerHTML = `
        <div class="ft-header">
          <div class="ft-market-badge ${doc.marketType || 'universal'}">
            ${doc.marketBadge}
          </div>
          <div class="ft-title">
            <span>${doc.title}</span>
            <span class="ft-title-code">${doc.code || ''}</span>
          </div>
        </div>
        <div class="ft-body">
          <div class="ft-row">
            <div class="ft-lbl"><span class="ft-icon">📐</span>数据来源与公式</div>
            <div class="ft-content ft-formula">${doc.source}</div>
          </div>
          <div class="ft-row">
            <div class="ft-lbl"><span class="ft-icon">💡</span>数据介绍与原理</div>
            <div class="ft-content">${doc.intro}</div>
          </div>
          <div class="ft-row">
            <div class="ft-lbl"><span class="ft-icon">📊</span>数据分布与基准</div>
            <div class="ft-content">${doc.distribution}</div>
          </div>
          <div class="ft-row">
            <div class="ft-lbl"><span class="ft-icon">🎯</span>实战影响与研判</div>
            <div class="ft-content">${doc.impact}</div>
          </div>
        </div>
      `;

      tip.style.display = 'block';

      // 定位基准：用 app 窗口的 bounding rect 做 clamp，保证浮窗不越出窗口边框
      const rect = targetEl.getBoundingClientRect();
      const bounds = getTooltipBounds(tip);
      const origin = getFixedOrigin(tip.parentNode);
      const pad = 10;
      const tipW = tip.offsetWidth || 350;
      let left = rect.left - tipW - 12;
      if (left < bounds.left + pad) {
        left = Math.max(bounds.left + pad, rect.right + 12);
        if (left + tipW > bounds.right - pad) {
          left = bounds.right - tipW - pad;
        }
      }
      left = Math.min(Math.max(left, bounds.left + pad), Math.max(bounds.left + pad, bounds.right - tipW - pad));

      requestAnimationFrame(() => {
        const tipH = tip.offsetHeight;
        let top = rect.top + (rect.height / 2) - (tipH / 2);
        if (top < bounds.top + pad) top = bounds.top + pad;
        if (top + tipH > bounds.bottom - pad) {
          top = Math.max(bounds.top + pad, bounds.bottom - tipH - pad);
        }
        // fixed 坐标减去实测原点，适配「窗口内部坐标系」与「视口坐标系」两种情况
        tip.style.left = `${Math.round(left - origin.x)}px`;
        tip.style.top = `${Math.round(top - origin.y)}px`;
      });
    }

    const container = document.getElementById('indicatorsBody') || document.body;
    container.addEventListener('mouseover', (e) => {
      const target = e.target.closest('[data-factor-key]');
      if (!target) return;
      const factorKey = target.dataset.factorKey;
      if (!factorKey) return;

      if (leaveTimer) {
        clearTimeout(leaveTimer);
        leaveTimer = null;
      }
      if (enterTimer) clearTimeout(enterTimer);
      enterTimer = setTimeout(() => {
        const doc = FACTOR_DOCS[factorKey];
        if (doc && target.matches(':hover')) {
          showFactorTooltip(target, doc);
        }
      }, 90);
    });

    container.addEventListener('mouseout', (e) => {
      if (e.target.closest('[data-factor-key]')) {
        hideFactorTooltip();
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PART 5: 应用全局状态与统一事件生命周期调度
  // ═══════════════════════════════════════════════════════════════════════════

  const App = {
    state: {
      symbol: 'GC=F',
      days: 90,
      layerVisible: {
        EMA: true,
        TD9: true,
        RSIDiv: true,
        Donchian: true,
        MACD: true,
        RSI: true,
      },
      activeFactors: {},
    },

    _resizeTimer: null,

    triggerChartResize(delay = 240) {
      if (this._resizeTimer) clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => {
        this._resizeTimer = null;
        ChartController.resize();
      }, delay);
    },

    async switchSymbol(symbol) {
      if (!symbol) return;
      this.state.symbol = symbol;

      const meta = MarketController.getSymbolMeta(symbol);
      MarketController.lastLiveSnapshot = null;
      MarketController.lastLiveValuation = null;
      MarketController.indicatorContexts = {};
      MarketController.isReplaying = false;
      MarketController.lastReplayedTime = null;
      MarketController.updateValuation(meta);

      MarketController.renderSidebarList();
      await MarketController.fetchKlineAndRender();
    },

    setupEventDelegation() {
      document.addEventListener('click', (e) => {
        const factorPop = document.getElementById('factorSelectorPopover');
        if (factorPop && factorPop.style.display !== 'none') {
          const isInsidePop = e.target.closest('#factorSelectorPopover') || e.target.closest('#subchip_Factors');
          if (!isInsidePop) {
            factorPop.style.display = 'none';
            document.getElementById('subchip_Factors')?.classList.remove('open');
          }
        }

        const target = e.target.closest('[data-action]');
        if (!target) return;

        switch (target.dataset.action) {
          case 'selectSymbol': {
            const sym = target.dataset.symbol;
            if (sym) this.switchSymbol(sym);
            break;
          }
          case 'toggleLayer':
            ChartController.toggleLayer(target.dataset.layer);
            break;
          case 'toggleSubLayer':
            ChartController.toggleSubLayer(target.dataset.layer);
            break;
          case 'toggleFactorPopover':
            ChartController.toggleFactorPopover();
            break;
          case 'toggleFactor':
            ChartController.toggleFactor(target.dataset.factor);
            break;
          case 'clearAllFactors':
            ChartController.clearAllFactors();
            break;
          case 'setDays': {
            const days = Number(target.dataset.days);
            if (days === 90 || days === 300) {
              MarketController.setDays(days);
            }
            break;
          }
        }
      });
    },

    syncLayerButtonStates() {
      Object.entries(this.state.layerVisible).forEach(([k, v]) => {
        const chip = document.getElementById('chip_' + k) || document.getElementById('subchip_' + k);
        if (chip) chip.classList.toggle('active', v !== false);
      });
    },

    syncDaysButtonStates() {
      const currentDays = this.state.days === 300 ? 300 : 90;
      document.querySelectorAll('#chartDaysSelector [data-days]').forEach((btn) => {
        const active = Number(btn.dataset.days) === currentDays;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    },

    async init() {
      this.setupEventDelegation();
      this.syncLayerButtonStates();
      this.syncDaysButtonStates();
      setupFactorDetailTooltip();

      ChartController.init();

      window.addEventListener('resize', () => {
        this.triggerChartResize(60);
      });

      await MarketController.init();
      await this.switchSymbol(this.state.symbol);
    },
  };

  window.addEventListener('DOMContentLoaded', () => {
    App.init();
  });
})();

