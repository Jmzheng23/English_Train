// ============================================================
// 拼写训练插件 (Spelling Trainer) - 修复版
// ============================================================

(function() {
    'use strict';

    // 等待主程序加载完成
    function waitForMainApp(callback, retries) {
        retries = retries || 0;
        if (retries > 30) {
            console.error('❌ 主程序加载超时，请刷新页面');
            return;
        }
        if (typeof getCurrentNotebook === 'function' && typeof showToast === 'function') {
            callback();
        } else {
            console.log('⏳ 等待主程序加载... (' + (retries + 1) + '/30)');
            setTimeout(function() {
                waitForMainApp(callback, retries + 1);
            }, 300);
        }
    }

    waitForMainApp(function() {
        console.log('✅ 主程序已就绪，加载拼写插件...');

        // ============================================================
        // 插件配置
        // ============================================================
        var PLUGIN_ID = 'spelling-trainer';
        var PLUGIN_NAME = '拼写训练模组';
        var PLUGIN_VERSION = '1.0.1';

        // 插件状态
        var spellingState = {
            mode: 'listening',
            currentWord: null,
            hintLevel: 0,
            mistakes: [],
            correctCount: 0,
            totalCount: 0,
            streak: 0,
            bestStreak: 0,
            history: [],
            isActive: false,
        };

        // ============================================================
        // 插件核心类
        // ============================================================
        function SpellingPlugin() {
            this.state = spellingState;
            this.words = [];
            this.currentWordObj = null;
            this.initialized = false;
            this.speechSynth = window.speechSynthesis;
        }

        SpellingPlugin.prototype.init = function() {
            if (this.initialized) return;
            this.loadWords();
            this.render();
            this.bindEvents();
            this.initialized = true;
            console.log('[' + PLUGIN_NAME + '] 初始化完成 v' + PLUGIN_VERSION);
        };

        SpellingPlugin.prototype.loadWords = function() {
            try {
                var nb = getCurrentNotebook();
                if (nb && nb.words && nb.words.length > 0) {
                    var marked = nb.words.filter(function(w) { return w.star || w.marked; });
                    this.words = marked.length > 0 ? marked : nb.words.slice();
                    this.shuffleArray(this.words);
                } else {
                    this.words = [];
                }
            } catch(e) {
                console.warn('加载单词失败:', e);
                this.words = [];
            }
            
            this.state.totalCount = 0;
            this.state.correctCount = 0;
            this.state.mistakes = [];
            this.state.history = [];
            this.state.currentWord = null;
            this.state.isActive = false;
        };

        SpellingPlugin.prototype.render = function() {
            var slot = document.getElementById('pluginSlot');
            if (!slot) {
                console.warn('插件容器未找到，延迟重试...');
                var self = this;
                setTimeout(function() { self.render(); }, 500);
                return;
            }
            slot.innerHTML = this.getPluginHTML();
            this.renderStats();
            this.updateDisplay('🎯 准备开始', '点击"开始训练"按钮');
        };

        SpellingPlugin.prototype.getPluginHTML = function() {
            return '<div id="spelling-plugin" style="padding:20px;background:white;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,0.06);">' +
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px;">' +
                    '<div><h3 style="color:#1a1a2e;">✏️ 拼写训练</h3><span style="font-size:13px;color:#888;">听音拼写 · 加强记忆</span></div>' +
                    '<div style="display:flex;gap:8px;">' +
                        '<button class="btn btn-primary btn-sm" onclick="spellingPlugin.toggleMode()"><span id="spellingModeBtn">▶ 开始训练</span></button>' +
                        '<button class="btn btn-outline btn-sm" onclick="spellingPlugin.resetStats()">🔄 重置</button>' +
                    '</div>' +
                '</div>' +
                '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(80px,1fr));gap:8px;margin-bottom:16px;">' +
                    '<div style="background:#f7f9fc;padding:8px 12px;border-radius:6px;text-align:center;"><div style="font-size:20px;font-weight:700;color:#1a73e8;" id="spellCorrect">0</div><div style="font-size:11px;color:#888;">正确</div></div>' +
                    '<div style="background:#f7f9fc;padding:8px 12px;border-radius:6px;text-align:center;"><div style="font-size:20px;font-weight:700;color:#e74c3c;" id="spellTotal">0</div><div style="font-size:11px;color:#888;">总题</div></div>' +
                    '<div style="background:#f7f9fc;padding:8px 12px;border-radius:6px;text-align:center;"><div style="font-size:20px;font-weight:700;color:#f39c12;" id="spellStreak">0</div><div style="font-size:11px;color:#888;">连击</div></div>' +
                    '<div style="background:#f7f9fc;padding:8px 12px;border-radius:6px;text-align:center;"><div style="font-size:20px;font-weight:700;color:#8e44ad;" id="spellBest">0</div><div style="font-size:11px;color:#888;">最佳</div></div>' +
                    '<div style="background:#f7f9fc;padding:8px 12px;border-radius:6px;text-align:center;"><div style="font-size:20px;font-weight:700;color:#27ae60;" id="spellAccuracy">0%</div><div style="font-size:11px;color:#888;">正确率</div></div>' +
                '</div>' +
                '<div style="background:#f7f9fc;border-radius:8px;padding:24px;text-align:center;min-height:150px;display:flex;flex-direction:column;justify-content:center;align-items:center;">' +
                    '<div id="spellDisplay" style="font-size:28px;font-weight:600;color:#1a1a2e;min-height:50px;">🎯 准备开始</div>' +
                    '<div id="spellHint" style="font-size:16px;color:#888;margin-top:8px;min-height:30px;">点击"开始训练"按钮</div>' +
                    '<div id="spellFeedback" style="margin-top:12px;font-size:14px;min-height:30px;"></div>' +
                '</div>' +
                '<div style="margin-top:16px;display:flex;gap:12px;flex-wrap:wrap;align-items:center;">' +
                    '<input type="text" id="spellInput" placeholder="输入拼写..." style="flex:1;min-width:180px;padding:12px 16px;border:2px solid #e2e8f0;border-radius:8px;font-size:16px;" onkeydown="if(event.key===\'Enter\') spellingPlugin.checkSpelling()">' +
                    '<button class="btn btn-primary" onclick="spellingPlugin.checkSpelling()">✅ 检查</button>' +
                    '<button class="btn btn-outline" onclick="spellingPlugin.nextSpelling()">➡️ 下一题</button>' +
                    '<button class="btn btn-ghost btn-sm" onclick="spellingPlugin.speakWord()">🔊 听音</button>' +
                '</div>' +
                '<div style="margin-top:12px;display:flex;gap:12px;flex-wrap:wrap;align-items:center;font-size:13px;color:#666;">' +
                    '<span>提示等级:</span>' +
                    '<button class="btn btn-sm btn-ghost" data-level="0" onclick="spellingPlugin.setHintLevel(0)">无</button>' +
                    '<button class="btn btn-sm btn-ghost" data-level="1" onclick="spellingPlugin.setHintLevel(1)">首字母</button>' +
                    '<button class="btn btn-sm btn-ghost" data-level="2" onclick="spellingPlugin.setHintLevel(2)">字母数</button>' +
                    '<button class="btn btn-sm btn-ghost" data-level="3" onclick="spellingPlugin.setHintLevel(3)">部分显示</button>' +
                    '<span style="margin-left:auto;" id="spellHintLevel">当前: 无</span>' +
                '</div>' +
                '<div id="spellMistakes" style="margin-top:16px;display:none;"><h4 style="font-size:14px;color:#e74c3c;">❌ 错误记录</h4><div id="spellMistakesList" style="max-height:100px;overflow-y:auto;font-size:13px;color:#555;"></div></div>' +
                '<div id="spellHistory" style="margin-top:12px;display:none;"><h4 style="font-size:14px;color:#888;">📋 训练记录</h4><div id="spellHistoryList" style="max-height:120px;overflow-y:auto;font-size:13px;color:#555;"></div></div>' +
            '</div>';
        };

        SpellingPlugin.prototype.bindEvents = function() {
            var self = this;
            document.addEventListener('click', function(e) {
                if (e.target.closest('.tab-item') || e.target.closest('.notebook-item')) {
                    setTimeout(function() {
                        self.loadWords();
                        self.renderStats();
                        if (self.state.isActive) {
                            self.nextSpelling();
                        }
                    }, 200);
                }
            });
        };

        SpellingPlugin.prototype.toggleMode = function() {
            if (!this.state.isActive) {
                this.startTraining();
            } else {
                this.stopTraining();
            }
        };

        SpellingPlugin.prototype.startTraining = function() {
            if (this.words.length === 0) {
                showToast('没有可用的单词，请先导入词书或收藏单词', 'warning');
                return;
            }
            this.state.isActive = true;
            this.state.totalCount = 0;
            this.state.correctCount = 0;
            this.state.mistakes = [];
            this.state.history = [];
            this.state.streak = 0;
            this.state.currentWord = null;
            var btn = document.getElementById('spellingModeBtn');
            if (btn) btn.textContent = '⏹ 停止训练';
            showToast('🎯 拼写训练开始！', 'success');
            this.nextSpelling();
            this.renderStats();
        };

        SpellingPlugin.prototype.stopTraining = function() {
            this.state.isActive = false;
            var btn = document.getElementById('spellingModeBtn');
            if (btn) btn.textContent = '▶ 开始训练';
            this.updateDisplay('⏸ 已暂停', '点击"开始训练"继续');
            var input = document.getElementById('spellInput');
            if (input) input.disabled = true;
            showToast('已暂停训练', 'info');
        };

        SpellingPlugin.prototype.nextSpelling = function() {
            if (!this.state.isActive) {
                this.updateDisplay('⏸ 已暂停', '点击"开始训练"继续');
                return;
            }
            if (this.words.length === 0) {
                this.updateDisplay('📭 没有单词', '请导入词书');
                return;
            }
            if (this.state.totalCount > 0 && this.state.totalCount % this.words.length === 0) {
                this.shuffleArray(this.words);
                showToast('🔄 所有单词已完成，重新开始！', 'info');
            }
            var index = this.state.totalCount % this.words.length;
            this.currentWordObj = this.words[index];
            this.state.currentWord = this.currentWordObj;
            var input = document.getElementById('spellInput');
            if (input) {
                input.value = '';
                input.disabled = false;
                input.focus();
            }
            this.updateSpellingDisplay();
            this.renderStats();
            var feedback = document.getElementById('spellFeedback');
            if (feedback) feedback.innerHTML = '';
        };

        SpellingPlugin.prototype.updateSpellingDisplay = function() {
            if (!this.currentWordObj) return;
            var word = this.currentWordObj;
            var isEnToCn = appData.mode === 'en_to_cn';
            var displayText = isEnToCn ? '📝 ' + word.chinese : '🔤 ' + word.english;
            var hintText = isEnToCn ? '请拼写对应的英文单词' : '请拼写对应的中文（拼音）';
            var hint = this.getHint(this.currentWordObj, isEnToCn);
            if (hint) hintText += ' | 提示: ' + hint;
            var display = document.getElementById('spellDisplay');
            var hintEl = document.getElementById('spellHint');
            if (display) display.innerHTML = displayText;
            if (hintEl) hintEl.textContent = hintText;
            if (this.state.mode === 'listening') {
                var self = this;
                setTimeout(function() { self.speakWord(); }, 300);
            }
        };

        SpellingPlugin.prototype.getHint = function(word, isEnToCn) {
            var level = this.state.hintLevel;
            var target = isEnToCn ? word.english : word.chinese;
            switch(level) {
                case 1: return '首字母: ' + target.charAt(0);
                case 2: return '共 ' + target.length + ' 个字符';
                case 3: {
                    var half = Math.floor(target.length / 2);
                    return '部分: ' + target.substring(0, half) + '___';
                }
                default: return '';
            }
        };

        SpellingPlugin.prototype.checkSpelling = function() {
            if (!this.state.isActive || !this.currentWordObj) {
                showToast('请先开始训练', 'warning');
                return;
            }
            var input = document.getElementById('spellInput');
            var userAnswer = input.value.trim();
            if (!userAnswer) {
                showToast('请输入拼写', 'warning');
                return;
            }
            var isEnToCn = appData.mode === 'en_to_cn';
            var correct = isEnToCn ? this.currentWordObj.english : this.currentWordObj.chinese;
            var isCorrect = this.compareSpelling(userAnswer, correct);
            this.state.totalCount++;
            var feedback = document.getElementById('spellFeedback');
            if (isCorrect) {
                this.state.correctCount++;
                this.state.streak++;
                if (this.state.streak > this.state.bestStreak) {
                    this.state.bestStreak = this.state.streak;
                }
                if (feedback) {
                    feedback.innerHTML = '<span style="color:#27ae60;font-weight:600;">✅ 正确！ 继续加油！</span><span style="color:#888;font-size:13px;margin-left:12px;">🔥 连击 ' + this.state.streak + '</span>';
                }
                var self = this;
                setTimeout(function() { self.nextSpelling(); }, 600);
            } else {
                this.state.streak = 0;
                this.state.mistakes.push({
                    word: this.currentWordObj,
                    userAnswer: userAnswer,
                    correct: correct,
                    time: new Date().toLocaleTimeString(),
                });
                if (feedback) {
                    feedback.innerHTML = '<span style="color:#e74c3c;font-weight:600;">❌ 拼写错误</span><div style="margin-top:4px;color:#555;">你的答案: <span style="color:#e74c3c;">' + userAnswer + '</span><br>正确答案: <span style="color:#27ae60;font-weight:600;">' + correct + '</span></div>';
                }
                this.renderMistakes();
                if (input) {
                    input.value = '';
                    input.focus();
                }
            }
            this.state.history.push({
                word: this.currentWordObj,
                userAnswer: userAnswer,
                correct: correct,
                isCorrect: isCorrect,
                time: new Date().toLocaleTimeString(),
            });
            this.renderStats();
            this.renderHistory();
        };

        SpellingPlugin.prototype.compareSpelling = function(user, correct) {
            var normalize = function(s) {
                return s.trim().toLowerCase().replace(/[^a-z\u4e00-\u9fff]/g, '');
            };
            var un = normalize(user);
            var cn = normalize(correct);
            if (un === cn) return true;
            if (appData.mode === 'cn_to_en') {
                var userWords = un.split(/\s+/);
                var correctWords = cn.split(/\s+/);
                var matched = userWords.filter(function(w) {
                    return correctWords.some(function(cw) { return cw.includes(w) || w.includes(cw); });
                });
                if (matched.length >= Math.min(userWords.length, correctWords.length) * 0.6) return true;
            }
            if (appData.mode === 'en_to_cn') {
                if (un.length > 0 && cn.length > 0) {
                    var common = un.split('').filter(function(c) { return cn.includes(c); });
                    if (common.length / Math.max(un.length, cn.length) > 0.5) return true;
                }
            }
            return false;
        };

        SpellingPlugin.prototype.setHintLevel = function(level) {
            this.state.hintLevel = level;
            document.querySelectorAll('[data-level]').forEach(function(btn) {
                btn.classList.toggle('active', parseInt(btn.dataset.level) === level);
                btn.style.background = parseInt(btn.dataset.level) === level ? '#1a73e8' : '';
                btn.style.color = parseInt(btn.dataset.level) === level ? 'white' : '';
            });
            var hintEl = document.getElementById('spellHintLevel');
            if (hintEl) hintEl.textContent = '当前: ' + ['无','首字母','字母数','部分显示'][level];
            if (this.currentWordObj) this.updateSpellingDisplay();
        };

        SpellingPlugin.prototype.speakWord = function() {
            if (!this.currentWordObj) return;
            var word = this.currentWordObj;
            var isEnToCn = appData.mode === 'en_to_cn';
            var text = isEnToCn ? word.english : word.chinese;
            if (this.speechSynth) {
                this.speechSynth.cancel();
                var utterance = new SpeechSynthesisUtterance(text);
                utterance.lang = isEnToCn ? 'en-US' : 'zh-CN';
                utterance.rate = 0.8;
                utterance.pitch = 1;
                var voices = this.speechSynth.getVoices();
                var voice = voices.find(function(v) { return v.lang.startsWith(isEnToCn ? 'en' : 'zh'); });
                if (voice) utterance.voice = voice;
                this.speechSynth.speak(utterance);
                showToast('🔊 听音: ' + text, 'info');
            } else {
                showToast('浏览器不支持语音合成', 'error');
            }
        };

        SpellingPlugin.prototype.renderStats = function() {
            var total = this.state.totalCount;
            var correct = this.state.correctCount;
            var accuracy = total > 0 ? Math.round(correct / total * 100) : 0;
            var ids = ['spellCorrect', 'spellTotal', 'spellStreak', 'spellBest', 'spellAccuracy'];
            var values = [correct, total, this.state.streak, this.state.bestStreak, total > 0 ? accuracy + '%' : '0%'];
            ids.forEach(function(id, i) {
                var el = document.getElementById(id);
                if (el) el.textContent = values[i];
            });
        };

        SpellingPlugin.prototype.renderMistakes = function() {
            var container = document.getElementById('spellMistakes');
            var list = document.getElementById('spellMistakesList');
            if (!container || !list) return;
            if (this.state.mistakes.length === 0) {
                container.style.display = 'none';
                return;
            }
            container.style.display = 'block';
            var self = this;
            list.innerHTML = this.state.mistakes.slice(-10).reverse().map(function(m) {
                return '<div style="padding:4px 0;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;"><span>' + m.word.english + ' → ' + m.correct + '</span><span style="color:#e74c3c;">✗ ' + m.userAnswer + '</span><span style="color:#888;font-size:12px;">' + m.time + '</span></div>';
            }).join('');
        };

        SpellingPlugin.prototype.renderHistory = function() {
            var container = document.getElementById('spellHistory');
            var list = document.getElementById('spellHistoryList');
            if (!container || !list) return;
            if (this.state.history.length === 0) {
                container.style.display = 'none';
                return;
            }
            container.style.display = 'block';
            var recent = this.state.history.slice(-10).reverse();
            list.innerHTML = recent.map(function(h) {
                return '<div style="padding:3px 0;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;font-size:13px;"><span>' + h.word.english + '</span><span>' + h.userAnswer + '</span><span style="color:' + (h.isCorrect ? '#27ae60' : '#e74c3c') + ';">' + (h.isCorrect ? '✅' : '❌') + '</span></div>';
            }).join('');
        };

        SpellingPlugin.prototype.updateDisplay = function(display, hint) {
            var d = document.getElementById('spellDisplay');
            var h = document.getElementById('spellHint');
            if (d) d.textContent = display;
            if (h) h.textContent = hint || '';
        };

        SpellingPlugin.prototype.resetStats = function() {
            if (this.state.isActive) {
                if (!confirm('确定要重置当前训练进度吗？')) return;
            }
            this.state.totalCount = 0;
            this.state.correctCount = 0;
            this.state.mistakes = [];
            this.state.history = [];
            this.state.streak = 0;
            this.state.bestStreak = 0;
            this.shuffleArray(this.words);
            this.renderStats();
            this.renderMistakes();
            this.renderHistory();
            this.updateDisplay('🔄 已重置', '点击"开始训练"重新开始');
            var input = document.getElementById('spellInput');
            if (input) input.value = '';
            var feedback = document.getElementById('spellFeedback');
            if (feedback) feedback.innerHTML = '';
            showToast('已重置统计数据', 'info');
        };

        SpellingPlugin.prototype.refreshWords = function() {
            this.loadWords();
            this.renderStats();
            this.updateDisplay('🔄 已刷新单词列表', '共 ' + this.words.length + ' 个单词');
        };

        SpellingPlugin.prototype.shuffleArray = function(arr) {
            for (var i = arr.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                var temp = arr[i];
                arr[i] = arr[j];
                arr[j] = temp;
            }
            return arr;
        };

        SpellingPlugin.prototype.destroy = function() {
            this.initialized = false;
            this.state.isActive = false;
            if (this.speechSynth) {
                this.speechSynth.cancel();
            }
            console.log('[' + PLUGIN_NAME + '] 已卸载');
        };

        // ============================================================
        // 导出插件实例
        // ============================================================
        window.spellingPlugin = new SpellingPlugin();

        window.registerPlugin = function() {
            var pluginInfo = {
                id: PLUGIN_ID,
                name: PLUGIN_NAME,
                version: PLUGIN_VERSION,
                description: '听音拼写训练，加强单词记忆',
                init: function() { return window.spellingPlugin.init(); },
                destroy: function() { return window.spellingPlugin.destroy(); },
                refresh: function() { return window.spellingPlugin.refreshWords(); },
            };
            if (!window.plugins) window.plugins = {};
            window.plugins[PLUGIN_ID] = pluginInfo;
            console.log('✅ 插件 "' + PLUGIN_NAME + '" 已注册');
            return pluginInfo;
        };

        window.registerPlugin();
        window.spellingPlugin.init();

        console.log('🔌 ' + PLUGIN_NAME + ' v' + PLUGIN_VERSION + ' 加载完成');
    });

})();
