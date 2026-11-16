/* Obsidian 风格关系图谱 (Local SVG & High-Performance Global Canvas) */
(function () {
  'use strict';

  // ---------- 1. 局部关系图谱 (文章页右侧栏 SVG 渲染) ----------
  function initLocalGraph() {
    var rawData = window.__GRAPH_DATA__;
    if (!rawData || !rawData.nodes || rawData.nodes.length === 0) {
      var card = document.querySelector('.rail-graph-card');
      if (card) card.style.display = 'none';
      return;
    }

    var container = document.getElementById('graph-viewport');
    var svgEl = document.getElementById('local-graph-svg');
    if (!container || !svgEl || typeof d3 === 'undefined') return;

    var width = container.clientWidth || 220;
    var height = container.clientHeight || 190;

    var nodes = rawData.nodes.map(function (d) { return Object.assign({}, d); });
    var links = rawData.links.map(function (d) { return Object.assign({}, d); });

    var svg = d3.select(svgEl).attr('viewBox', [0, 0, width, height]);
    svg.selectAll('*').remove();

    var g = svg.append('g').attr('class', 'graph-root');

    var zoom = d3.zoom()
      .scaleExtent([0.2, 4])
      .on('zoom', function (event) {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    var simulation = d3.forceSimulation(nodes)
      .alphaDecay(0.04)
      .force('link', d3.forceLink(links).id(function (d) { return d.id; }).distance(function (d) {
        return d.type === 'neighbor' ? 55 : 45;
      }))
      .force('charge', d3.forceManyBody().strength(function (d) {
        return d.type === 'current' ? -160 : -90;
      }).distanceMax(180))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(function (d) {
        return d.type === 'current' ? 20 : 14;
      }));

    var link = g.append('g')
      .attr('class', 'graph-links')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('class', function (d) {
        return 'graph-edge ' + (d.type === 'neighbor' ? 'graph-edge--neighbor' : 'graph-edge--direct');
      });

    var node = g.append('g')
      .attr('class', 'graph-nodes')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('class', function (d) {
        return 'graph-node graph-node--' + d.type;
      })
      .call(d3.drag()
        .on('start', function (event, d) {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on('drag', function (event, d) {
          d.fx = event.x; d.fy = event.y;
        })
        .on('end', function (event, d) {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null; d.fy = null;
        }));

    node.append('circle')
      .attr('r', function (d) {
        if (d.type === 'current') return 8;
        if (d.type === 'outgoing' || d.type === 'backlink') return 6;
        return 4.5;
      });

    node.append('text')
      .text(function (d) {
        var t = d.title || '';
        return t.length > 8 ? t.slice(0, 7) + '…' : t;
      })
      .attr('x', 9)
      .attr('y', 3.5);

    var tooltip = d3.select(container).select('.graph-tooltip');
    if (tooltip.empty()) {
      tooltip = d3.select(container).append('div').attr('class', 'graph-tooltip');
    }

    var TAG_MAP = {
      current: { label: '当前笔记', cls: 'current' },
      outgoing: { label: '引用笔记', cls: 'outgoing' },
      backlink: { label: '反向链接 (Backlink)', cls: 'backlink' },
      neighbor: { label: '同主题关联', cls: 'neighbor' }
    };

    node.on('mouseenter', function (event, d) {
      var connectedIds = new Set([d.id]);
      links.forEach(function (l) {
        var sId = typeof l.source === 'object' ? l.source.id : l.source;
        var tId = typeof l.target === 'object' ? l.target.id : l.target;
        if (sId === d.id) connectedIds.add(tId);
        if (tId === d.id) connectedIds.add(sId);
      });

      node.style('opacity', function (n) {
        return connectedIds.has(n.id) ? 1 : 0.18;
      });
      link.classed('graph-edge--active', function (l) {
        var sId = typeof l.source === 'object' ? l.source.id : l.source;
        var tId = typeof l.target === 'object' ? l.target.id : l.target;
        return sId === d.id || tId === d.id;
      }).style('opacity', function (l) {
        var sId = typeof l.source === 'object' ? l.source.id : l.source;
        var tId = typeof l.target === 'object' ? l.target.id : l.target;
        return (sId === d.id || tId === d.id) ? 1 : 0.08;
      });

      var info = TAG_MAP[d.type] || TAG_MAP.neighbor;
      tooltip.html(
        '<span class="graph-tooltip-tag graph-tooltip-tag--' + info.cls + '">' + info.label + '</span>' +
        '<div style="font-weight:600">' + (d.title || '') + '</div>'
      );
      tooltip.classed('visible', true);

      var rect = container.getBoundingClientRect();
      var x = event.clientX - rect.left + 10;
      var y = event.clientY - rect.top + 10;
      if (x + 180 > rect.width) x = x - 190;
      if (y + 50 > rect.height) y = y - 60;
      tooltip.style('left', Math.max(4, x) + 'px').style('top', Math.max(4, y) + 'px');
    });

    node.on('mouseleave', function () {
      node.style('opacity', 1);
      link.classed('graph-edge--active', false).style('opacity', null);
      tooltip.classed('visible', false);
    });

    node.on('click', function (event, d) {
      if (d.url && d.type !== 'current') {
        window.location.href = d.url;
      }
    });

    simulation.on('tick', function () {
      link
        .attr('x1', function (d) { return d.source.x; })
        .attr('y1', function (d) { return d.source.y; })
        .attr('x2', function (d) { return d.target.x; })
        .attr('y2', function (d) { return d.target.y; });

      node.attr('transform', function (d) {
        return 'translate(' + d.x + ',' + d.y + ')';
      });
    });

    var btnIn = document.getElementById('graph-zoom-in');
    var btnOut = document.getElementById('graph-zoom-out');
    var btnReset = document.getElementById('graph-reset');

    if (btnIn) btnIn.onclick = function () { svg.transition().duration(200).call(zoom.scaleBy, 1.35); };
    if (btnOut) btnOut.onclick = function () { svg.transition().duration(200).call(zoom.scaleBy, 0.74); };
    if (btnReset) btnReset.onclick = function () { svg.transition().duration(250).call(zoom.transform, d3.zoomIdentity); };

    window.addEventListener('resize', function () {
      var w = container.clientWidth || 220;
      var h = container.clientHeight || 190;
      svg.attr('viewBox', [0, 0, w, h]);
      simulation.force('center', d3.forceCenter(w / 2, h / 2));
      simulation.alpha(0.1).restart();
    });
  }

  // ---------- 2. 通用高性能 Canvas 2D 知识图谱渲染器 ----------
  function setupCanvasGraph(data, canvasEl, container, opts) {
    opts = opts || {};
    var width = container.clientWidth || 900;
    var height = container.clientHeight || 420;
    var dpr = window.devicePixelRatio || 1;

    canvasEl.width = width * dpr;
    canvasEl.height = height * dpr;
    canvasEl.style.width = width + 'px';
    canvasEl.style.height = height + 'px';

    var ctx = canvasEl.getContext('2d');
    ctx.scale(dpr, dpr);

    var nodes = data.nodes.map(function (d) { return Object.assign({}, d); });
    var links = data.links.map(function (d) { return Object.assign({}, d); });

    var adjMap = new Map();
    links.forEach(function (l) {
      var s = l.source;
      var t = l.target;
      if (!adjMap.has(s)) adjMap.set(s, new Set());
      if (!adjMap.has(t)) adjMap.set(t, new Set());
      adjMap.get(s).add(t);
      adjMap.get(t).add(s);
    });

    var transform = d3.zoomIdentity;
    var hoveredNode = null;
    var filterQuery = '';
    var isDark = document.body.getAttribute('data-scheme') === 'dark';

    var tooltip = d3.select(container).select('.graph-tooltip');
    if (tooltip.empty()) {
      tooltip = d3.select(container).append('div').attr('class', 'graph-tooltip');
    }

    var zoom = d3.zoom()
      .scaleExtent([0.08, 6])
      .on('zoom', function (event) {
        transform = event.transform;
        draw();
      });

    d3.select(canvasEl).call(zoom);

    var sim = d3.forceSimulation(nodes)
      .alphaDecay(0.045)
      .velocityDecay(0.35)
      .force('link', d3.forceLink(links).id(function (d) { return d.id; }).distance(26).iterations(1))
      .force('charge', d3.forceManyBody().strength(-24).distanceMax(170).theta(0.9))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius(4.2).iterations(1));

    d3.select(canvasEl).call(d3.drag()
      .container(canvasEl)
      .subject(function (event) {
        var p = transform.invert([event.x, event.y]);
        return sim.find(p[0], p[1], 15 / transform.k);
      })
      .on('start', function (event) {
        if (!event.active) sim.alphaTarget(0.2).restart();
        event.subject.fx = event.subject.x;
        event.subject.fy = event.subject.y;
      })
      .on('drag', function (event) {
        var p = transform.invert([event.x, event.y]);
        event.subject.fx = p[0];
        event.subject.fy = p[1];
        draw();
      })
      .on('end', function (event) {
        if (!event.active) sim.alphaTarget(0);
        event.subject.fx = null;
        event.subject.fy = null;
      }));

    canvasEl.onmousemove = function (event) {
      var rect = canvasEl.getBoundingClientRect();
      var mx = event.clientX - rect.left;
      var my = event.clientY - rect.top;
      var p = transform.invert([mx, my]);
      var hit = sim.find(p[0], p[1], 16 / transform.k);

      if (hit !== hoveredNode) {
        hoveredNode = hit;
        draw();

        if (hoveredNode) {
          tooltip.html(
            '<span class="graph-tooltip-tag" style="background:' + (hoveredNode.color || 'var(--accent)') + ';color:#fff">' +
            (hoveredNode.top || '知识节点') + '</span>' +
            '<div style="font-weight:600;margin-top:2px">' + (hoveredNode.title || '') + '</div>' +
            '<div style="font-size:10px;color:var(--text-tertiary);margin-top:2px">点击跳转笔记 →</div>'
          );
          tooltip.classed('visible', true);
          var tx = mx + 12;
          var ty = my + 12;
          if (tx + 190 > width) tx = tx - 200;
          if (ty + 60 > height) ty = ty - 70;
          tooltip.style('left', Math.max(4, tx) + 'px').style('top', Math.max(4, ty) + 'px');
        } else {
          tooltip.classed('visible', false);
        }
      }
    };

    canvasEl.onmouseleave = function () {
      if (hoveredNode) {
        hoveredNode = null;
        draw();
        tooltip.classed('visible', false);
      }
    };

    canvasEl.onclick = function () {
      if (hoveredNode && hoveredNode.url) {
        window.location.href = hoveredNode.url;
      }
    };

    function draw() {
      ctx.save();
      ctx.clearRect(0, 0, width, height);

      ctx.translate(transform.x, transform.y);
      ctx.scale(transform.k, transform.k);

      var currentPath = window.location.pathname;
      var activeNeighbors = null;
      if (hoveredNode) {
        activeNeighbors = adjMap.get(hoveredNode.id) || new Set();
      }

      // 普通连线
      ctx.beginPath();
      ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.07)';
      ctx.lineWidth = 0.75 / transform.k;
      for (var i = 0; i < links.length; i++) {
        var l = links[i];
        ctx.moveTo(l.source.x, l.source.y);
        ctx.lineTo(l.target.x, l.target.y);
      }
      ctx.stroke();

      // 高亮连线
      if (hoveredNode) {
        ctx.beginPath();
        ctx.strokeStyle = '#2b6cff';
        ctx.lineWidth = 1.8 / transform.k;
        for (var j = 0; j < links.length; j++) {
          var lk = links[j];
          var sId = lk.source.id || lk.source;
          var tId = lk.target.id || lk.target;
          if (sId === hoveredNode.id || tId === hoveredNode.id) {
            ctx.moveTo(lk.source.x, lk.source.y);
            ctx.lineTo(lk.target.x, lk.target.y);
          }
        }
        ctx.stroke();
      }

      // 节点
      for (var k = 0; k < nodes.length; k++) {
        var n = nodes[k];
        var isCurrent = n.url && n.url === currentPath;
        var isHovered = hoveredNode && hoveredNode.id === n.id;
        var isConnected = activeNeighbors && activeNeighbors.has(n.id);
        var isMatchFilter = !filterQuery || (n.title && n.title.toLowerCase().indexOf(filterQuery) !== -1);

        var r = 3;
        if (isCurrent) r = 7;
        else if (isHovered) r = 6.5;
        else if (isConnected) r = 4.8;
        else if (filterQuery && isMatchFilter) r = 5.5;

        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, 6.2831853);

        if (hoveredNode) {
          if (isHovered || isConnected) {
            ctx.fillStyle = n.color || '#2b6cff';
          } else {
            ctx.fillStyle = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)';
          }
        } else if (filterQuery) {
          if (isMatchFilter) {
            ctx.fillStyle = n.color || '#2b6cff';
          } else {
            ctx.fillStyle = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
          }
        } else {
          ctx.fillStyle = n.color || (isDark ? '#94a3b8' : '#64748b');
        }
        ctx.fill();

        if (isCurrent) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      // 文字标签
      if (transform.k > 1.35 || hoveredNode || filterQuery) {
        ctx.font = '10px "LXGWWenKaiMono", -apple-system, sans-serif';
        ctx.textBaseline = 'middle';

        for (var m = 0; m < nodes.length; m++) {
          var nd = nodes[m];
          var showText = false;
          if (hoveredNode && (nd.id === hoveredNode.id || (activeNeighbors && activeNeighbors.has(nd.id)))) {
            showText = true;
          } else if (filterQuery && nd.title && nd.title.toLowerCase().indexOf(filterQuery) !== -1) {
            showText = true;
          } else if (transform.k > 2.0) {
            showText = true;
          }

          if (showText) {
            ctx.fillStyle = isDark ? '#f1f5f9' : '#0f172a';
            ctx.fillText(nd.title, nd.x + 8, nd.y);
          }
        }
      }

      ctx.restore();
    }

    sim.on('tick', function () {
      draw();
    });

    if (opts.zoomInId) {
      var zin = document.getElementById(opts.zoomInId);
      if (zin) zin.onclick = function () { d3.select(canvasEl).transition().duration(200).call(zoom.scaleBy, 1.35); };
    }
    if (opts.zoomOutId) {
      var zout = document.getElementById(opts.zoomOutId);
      if (zout) zout.onclick = function () { d3.select(canvasEl).transition().duration(200).call(zoom.scaleBy, 0.74); };
    }
    if (opts.resetId) {
      var rst = document.getElementById(opts.resetId);
      if (rst) rst.onclick = function () { d3.select(canvasEl).transition().duration(250).call(zoom.transform, d3.zoomIdentity); };
    }
    if (opts.searchId) {
      var sin = document.getElementById(opts.searchId);
      if (sin) {
        sin.oninput = function () {
          filterQuery = sin.value.trim().toLowerCase();
          draw();
        };
      }
    }

    window.addEventListener('resize', function () {
      var w = container.clientWidth || width;
      var h = container.clientHeight || height;
      canvasEl.width = w * dpr;
      canvasEl.height = h * dpr;
      canvasEl.style.width = w + 'px';
      canvasEl.style.height = h + 'px';
      ctx.scale(dpr, dpr);
      sim.force('center', d3.forceCenter(w / 2, h / 2));
      draw();
    });

    return {
      simulation: sim,
      render: draw,
      setFilter: function (q) {
        filterQuery = (q || '').trim().toLowerCase();
        draw();
      }
    };
  }

  // ---------- 3. 首页全景知识星图卡片初始化 ----------
  function initHomeGraph() {
    var canvasEl = document.getElementById('home-graph-canvas');
    var container = document.getElementById('home-graph-viewport');
    if (!canvasEl || !container || typeof d3 === 'undefined') return;

    fetch('/graph.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        setupCanvasGraph(data, canvasEl, container, {
          zoomInId: 'home-zoom-in',
          zoomOutId: 'home-zoom-out',
          resetId: 'home-reset',
          searchId: 'home-graph-search'
        });
      })
      .catch(function (err) {
        console.error('加载首页全库图谱失败:', err);
      });
  }

  // ---------- 4. 全屏大图谱模态框逻辑 ----------
  function initModalGraph() {
    var expandBtn = document.getElementById('graph-expand-btn');
    var backdrop = document.getElementById('graph-modal-backdrop');
    var closeBtn = document.getElementById('graph-modal-close');
    var svgEl = document.getElementById('modal-graph-svg');
    var canvasEl = document.getElementById('modal-graph-canvas');
    var container = document.getElementById('modal-graph-container');
    if (!expandBtn || !backdrop || !container) return;

    var globalDataCache = null;
    var currentTab = 'local';
    var localSim = null;
    var globalCanvasHandler = null;

    function openModal() {
      backdrop.classList.add('is-open');
      backdrop.setAttribute('aria-hidden', 'false');
      renderCurrentModal();
    }

    function closeModal() {
      backdrop.classList.remove('is-open');
      backdrop.setAttribute('aria-hidden', 'true');
      if (localSim) localSim.stop();
      if (globalCanvasHandler && globalCanvasHandler.simulation) globalCanvasHandler.simulation.stop();
    }

    expandBtn.onclick = openModal;
    if (closeBtn) closeBtn.onclick = closeModal;
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) closeModal();
    });
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && backdrop.classList.contains('is-open')) closeModal();
    });

    var tabs = backdrop.querySelectorAll('.graph-tab-btn');
    tabs.forEach(function (btn) {
      btn.onclick = function () {
        tabs.forEach(function (b) { return b.classList.remove('active'); });
        btn.classList.add('active');
        currentTab = btn.dataset.tab;
        renderCurrentModal();
      };
    });

    var searchInput = document.getElementById('graph-search');
    if (searchInput) {
      searchInput.oninput = function () {
        var q = searchInput.value.trim().toLowerCase();
        if (currentTab === 'local') {
          var svg = d3.select(svgEl);
          svg.selectAll('.graph-node').each(function (d) {
            var matched = !q || (d.title && d.title.toLowerCase().indexOf(q) !== -1);
            d3.select(this)
              .style('opacity', matched ? 1 : 0.12)
              .select('circle')
              .attr('r', matched ? (d.type === 'current' ? 10 : 7) : 3);
          });
        } else if (globalCanvasHandler) {
          globalCanvasHandler.setFilter(q);
        }
      };
    }

    function renderCurrentModal() {
      if (localSim) localSim.stop();
      if (globalCanvasHandler && globalCanvasHandler.simulation) globalCanvasHandler.simulation.stop();

      if (currentTab === 'local') {
        svgEl.style.display = 'block';
        canvasEl.style.display = 'none';
        renderModalLocalSvg();
      } else {
        svgEl.style.display = 'none';
        canvasEl.style.display = 'block';
        renderModalGlobalCanvas();
      }
    }

    function renderModalLocalSvg() {
      var rawData = window.__GRAPH_DATA__;
      if (!rawData || !rawData.nodes) return;

      var width = container.clientWidth || 900;
      var height = container.clientHeight || 600;

      var nodes = rawData.nodes.map(function (d) { return Object.assign({}, d); });
      var links = rawData.links.map(function (d) { return Object.assign({}, d); });

      var svg = d3.select(svgEl).attr('viewBox', [0, 0, width, height]);
      svg.selectAll('*').remove();

      var g = svg.append('g').attr('class', 'graph-modal-root');
      var zoom = d3.zoom().scaleExtent([0.1, 8]).on('zoom', function (e) {
        g.attr('transform', e.transform);
      });
      svg.call(zoom);

      var link = g.append('g')
        .attr('class', 'graph-links')
        .selectAll('line')
        .data(links)
        .join('line')
        .attr('class', function (d) {
          return 'graph-edge ' + (d.type === 'neighbor' ? 'graph-edge--neighbor' : 'graph-edge--direct');
        });

      var node = g.append('g')
        .attr('class', 'graph-nodes')
        .selectAll('g')
        .data(nodes)
        .join('g')
        .attr('class', function (d) {
          return 'graph-node graph-node--' + d.type;
        })
        .call(d3.drag()
          .on('start', function (e, d) { if (!e.active) localSim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
          .on('drag', function (e, d) { d.fx = e.x; d.fy = e.y; })
          .on('end', function (e, d) { if (!e.active) localSim.alphaTarget(0); d.fx = null; d.fy = null; }));

      node.append('circle').attr('r', function (d) {
        return d.type === 'current' ? 10 : (d.type === 'neighbor' ? 5.5 : 7.5);
      });

      node.append('text')
        .text(function (d) { return d.title || ''; })
        .attr('x', 11)
        .attr('y', 4);

      node.on('mouseenter', function (event, d) {
        var connectedIds = new Set([d.id]);
        links.forEach(function (l) {
          var sId = typeof l.source === 'object' ? l.source.id : l.source;
          var tId = typeof l.target === 'object' ? l.target.id : l.target;
          if (sId === d.id) connectedIds.add(tId);
          if (tId === d.id) connectedIds.add(sId);
        });
        node.style('opacity', function (n) { return connectedIds.has(n.id) ? 1 : 0.12; });
        link.classed('graph-edge--active', function (l) {
          var sId = typeof l.source === 'object' ? l.source.id : l.source;
          var tId = typeof l.target === 'object' ? l.target.id : l.target;
          return sId === d.id || tId === d.id;
        });
      });
      node.on('mouseleave', function () {
        node.style('opacity', 1);
        link.classed('graph-edge--active', false);
      });
      node.on('click', function (e, d) {
        if (d.url && d.type !== 'current') window.location.href = d.url;
      });

      localSim = d3.forceSimulation(nodes)
        .alphaDecay(0.04)
        .force('link', d3.forceLink(links).id(function (d) { return d.id; }).distance(70))
        .force('charge', d3.forceManyBody().strength(-140).distanceMax(250))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide().radius(20));

      localSim.on('tick', function () {
        link
          .attr('x1', function (d) { return d.source.x; })
          .attr('y1', function (d) { return d.source.y; })
          .attr('x2', function (d) { return d.target.x; })
          .attr('y2', function (d) { return d.target.y; });
        node.attr('transform', function (d) { return 'translate(' + d.x + ',' + d.y + ')'; });
      });
    }

    function renderModalGlobalCanvas() {
      if (globalDataCache) {
        globalCanvasHandler = setupCanvasGraph(globalDataCache, canvasEl, container);
      } else {
        fetch('/graph.json')
          .then(function (r) { return r.json(); })
          .then(function (data) {
            globalDataCache = data;
            globalCanvasHandler = setupCanvasGraph(data, canvasEl, container);
          })
          .catch(function (err) {
            console.error('加载全库图谱失败:', err);
          });
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initLocalGraph();
      initHomeGraph();
      initModalGraph();
    });
  } else {
    initLocalGraph();
    initHomeGraph();
    initModalGraph();
  }
})();
