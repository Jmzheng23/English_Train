
// ============================================================
// 拼写训练插件 (Spelling Trainer)
// ============================================================

(function() {
    'use strict';

    // 插件配置
    const PLUGIN_ID = 'spelling-trainer';
    const PLUGIN_NAME = '拼写训练模组';
    const PLUGIN_VERSION = '1.0.0';

    // 插件状态
    let spellingState = {
        mode: 'listening', // 'listening' | 'spelling' | 'review'
        currentWord: null,
        hintLevel: 0, // 0=无提示, 1=首字母, 2=字母数量, 3=显示部分
        mistakes: [],
        correctCount: 0,
        totalCount: 0,
        streak: 0,
        bestStreak: 0,
        history: [],
        isActive: false,
    };

    // ============================================================
    // 插件UI模板
    // ============================================================

    function getPluginHTML() {
        return `
            <div id="spelling-plugin" style="padding:20px;background:white;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
                <!-- 头部 -->
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
                    <div>
                        <h3 style="color:#1a1a2e;">✏️ 拼写训练</h3>
                        <span style="font-size:13px;color:#888;">听音拼写 · 加强记忆</span>
                    </div>
                    <div style="display:flex;gap:8px;">
                        <button class="btn btn-primary btn-sm" onclick="spellingPlugin.toggleMode()">
                            <span id="spellingModeBtn">▶ 开始训练</span>
                        </button>
                        <button class="btn btn-outline btn-sm" onclick="spellingPlugin.resetStats()">🔄 重置</button>
                    </div>
                </div>

                <!-- 统计 -->
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(80px,1fr));gap:8px;margin-bottom:16px;">
                    <div style="background:#f7f9fc;padding:8px 12px;border-radius:6px;text-align:center;">
                        <div style="font-size:20px;font-weight:700;color:#1a73e8;" id="spellCorrect">0</div>
                        <div style="font-size:11px;color:#888;">正确</div>
                    </div>
                    <div style="background:#f7f9fc;padding:8px 12px;border-radius:6px;text-align:center;">
                        <div style="font-size:20px;font-weight:700;color:#e74c3c;" id="spellTotal">0</div>
                        <div style="font-size:11px;color:#888;">总题</div>
                    </div>
                    <div style="background:#f7f9fc;padding:8px 12px;border-radius:6px;text-align:center;">
                        <div style="font-size:20px;font-weight:700;color:#f39c12;" id="spellStreak">0</div>
                        <div style="font-size:11px;color:#888;">连击</div>
                    </div>
                    <div style="background:#f7f9fc;padding:8px 12px;border-radius:6px;text-align:center;">
                        <div style="font-size:20px;font-weight:700;color:#8e44ad;" id="spellBest">0</div>
                        <div style="font-size:11px;color:#888;">最佳</div>
                    </div>
                    <div style="background:#f7f9fc;padding:8px 12px;border-radius:6px;text-align:center;">
                        <div style="font-size:20px;font-weight:700;color:#27ae60;" id="spellAccuracy">0%</div>
                        <div style="font-size:11px;color:#888;">正确率</div>
                    </div>
                </div>

                <!-- 主训练区 -->
                <div style="background:#f7f9fc;border-radius:8px;padding:24px;text-align:center;min-height:180px;display:flex;flex-direction:column;justify-content:center;align-items:center;">
                    <div id="spellDisplay" style="font-size:28px;font-weight:600;color:#1a1a2e;min-height:50px;">
                        🎯 准备开始
                    </div>
                    <div id="spellHint" style="font-size:16px;color:#888;margin-top:8px;min-height:30px;">
                        点击"开始训练"按钮
                    </div>
                    <div id="spellFeedback" style="margin-top:12px;font-size:14px;min-height:30px;"></div>
                </div>

                <!-- 输入区 -->
                <div style="margin-top:16px;display:flex;gap:12px;flex-wrap:wrap;align-items:center;">
                    <input type="text" id="spellInput" 
                           placeholder="输入拼写..." 
                           style="flex:1;min-width:180px;padding:12px 16px;border:2px solid #e2e8f0;border-radius:8px;font-size:16px;"
                           onkeydown="if(event.key==='Enter') spellingPlugin.checkSpelling()">
                    <button class="btn btn-primary" onclick="spellingPlugin.checkSpelling()">✅ 检查</button>
                    <button class="btn btn-outline" onclick="spellingPlugin.nextSpelling()">➡️ 下一题</button>
                    <button class="btn btn-ghost btn-sm" onclick="spellingPlugin.speakWord()">🔊 听音</button>
                </div>

                <!-- 提示选项 -->
                <div style="margin-top:12px;display:flex;gap:12px;flex-wrap:wrap;align-items:center;font-size:13px;color:#666;">
                    <span>提示等级:</span>
                    <button class="btn btn-sm btn-ghost" data-level="0" onclick="spellingPlugin.setHintLevel(0)">无</button>
                    <button class="btn btn-sm btn-ghost" data-level="1" onclick="spellingPlugin.setHintLevel(1)">首字母</button>
                    <button class="btn btn-sm btn-ghost" data-level="2" onclick="spellingPlugin.setHintLevel(2)">字母数</button>
                    <button class="btn btn-sm btn-ghost" data-level="3" onclick="spellingPlugin.setHintLevel(3)">部分显示</button>
                    <span style="margin-left:auto;" id="spellHintLevel">当前: 无</span>
                </div>

                <!-- 错误列表 -->
                <div id="spellMistakes" style="margin-top:16px;display:none;">
                    <h4 style="font-size:14px;color:#e74c3c;">❌ 错误记录</h4>
                    <div id="spellMistakesList" style="max-height:100px;overflow-y:auto;font-size:13px;color:#555;"></div>
                </div>

                <!-- 历史记录 -->
                <div id="spellHistory" style="margin-top:12px;display:none;">
                    <h4 style="font-size:14px;color:#888;">📋 训练记录</h4>
                    <div id="spellHistoryList" style="max-height:120px;overflow-y:auto;font-size:13px;color:#555;"></div>
                </div>
            </div>
        `;
    }

    // ============================================================
    // 插件核心逻辑
    // ============================================================

    class SpellingPlugin {
        constructor() {
            this.state = spellingState;
            this.words = [];
            this.currentWordObj = null;
            this.initialized = false;
            this.speechSynth = window.speechSynthesis;
        }

        // 初始化插件
        init() {
            if (this.initialized) return;
            this.loadWords();
            this.render();
            this.bindEvents();
            this.initialized = true;
            console.log(`[${PLUGIN_NAME}] 初始化完成 v${PLUGIN_VERSION}`);
        }

        // 加载单词
        loadWords() {
            const nb = getCurrentNotebook();
            if (nb && nb.words.length > 0) {
                // 优先使用收藏/标记的单词，否则使用所有单词
                const marked = nb.words.filter(w => w.star || w.marked);
                this.words = marked.length > 0 ? marked : nb.words;
                // 打乱顺序
                this.shuffleArray(this.words);
            } else {
                this.words = [];
            }
            this.state.totalCount = 0;
            this.state.correctCount = 0;
            this.state.mistakes = [];
            this.state.history = [];
            this.state.currentWord = null;
            this.state.isActive = false;
        }

        // 刷新单词列表
        refreshWords() {
            this.loadWords();
            this.renderStats();
            this.updateDisplay('🔄 已刷新单词列表', `共 ${this.words.length} 个单词`);
        }

        // 渲染插件UI
        render() {
            const slot = document.getElementById('pluginSlot');
            if (slot) {
                slot.innerHTML = getPluginHTML();
                this.renderStats();
                this.updateDisplay('🎯 准备开始', '点击"开始训练"按钮');
            }
        }

        // 绑定事件
        bindEvents() {
            // 监听词书切换
            const observer = new MutationObserver(() => {
                if (this.state.isActive) {
                    this.loadWords();
                    this.renderStats();
                }
            });
            // 简单监听标签点击
            document.addEventListener('click', (e) => {
                if (e.target.closest('.tab-item') || e.target.closest('.notebook-item')) {
                    setTimeout(() => {
                        this.loadWords();
                        this.renderStats();
                        if (this.state.isActive) {
                            this.nextSpelling();
                        }
                    }, 100);
                }
            });
        }

        // ============================================================
        // 核心功能
        // ============================================================

        // 切换训练模式
        toggleMode() {
            if (!this.state.isActive) {
                this.startTraining();
            } else {
                this.stopTraining();
            }
        }

        startTraining() {
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
            document.getElementById('spellingModeBtn').textContent = '⏹ 停止训练';
            showToast('🎯 拼写训练开始！', 'success');
            this.nextSpelling();
            this.renderStats();
        }

        stopTraining() {
            this.state.isActive = false;
            document.getElementById('spellingModeBtn').textContent = '▶ 开始训练';
            this.updateDisplay('⏸ 已暂停', '点击"开始训练"继续');
            document.getElementById('spellInput').disabled = true;
            showToast('已暂停训练', 'info');
        }

        // 获取下一题
        nextSpelling() {
            if (!this.state.isActive) {
                this.updateDisplay('⏸ 已暂停', '点击"开始训练"继续');
                return;
            }

            if (this.words.length === 0) {
                this.updateDisplay('📭 没有单词', '请导入词书');
                return;
            }

            // 如果所有单词都练完了，重新开始
            if (this.state.totalCount > 0 && this.state.totalCount % this.words.length === 0) {
                // 打乱顺序重新开始
                this.shuffleArray(this.words);
                showToast('🔄 所有单词已完成，重新开始！', 'info');
            }

            // 选择下一个单词（循环）
            const index = this.state.totalCount % this.words.length;
            this.currentWordObj = this.words[index];
            this.state.currentWord = this.currentWordObj;
            
            // 重置输入
            const input = document.getElementById('spellInput');
            if (input) {
                input.value = '';
                input.disabled = false;
                input.focus();
            }
            
            // 更新显示
            this.updateSpellingDisplay();
            this.renderStats();
            document.getElementById('spellFeedback').innerHTML = '';
        }

        // 更新拼写显示
        updateSpellingDisplay() {
            if (!this.currentWordObj) return;

            const word = this.currentWordObj;
            const isEnToCn = appData.mode === 'en_to_cn';
            
            // 显示提示信息（中文或英文）
            let displayText = '';
            let hintText = '';
            
            if (isEnToCn) {
                // 给出中文，拼写英文
                displayText = `📝 ${word.chinese}`;
                hintText = `请拼写对应的英文单词`;
            } else {
                // 给出英文，拼写中文（拼音模式）
                displayText = `🔤 ${word.english}`;
                hintText = `请拼写对应的中文（拼音）`;
            }

            // 添加提示等级
            const hint = this.getHint(this.currentWordObj, isEnToCn);
            if (hint) {
                hintText += ` | 提示: ${hint}`;
            }

            document.getElementById('spellDisplay').innerHTML = displayText;
            document.getElementById('spellHint').textContent = hintText;
            
            // 自动朗读（听力模式）
            if (this.state.mode === 'listening') {
                setTimeout(() => this.speakWord(), 300);
            }
        }

        // 获取提示
        getHint(word, isEnToCn) {
            const level = this.state.hintLevel;
            const target = isEnToCn ? word.english : word.chinese;
            
            switch(level) {
                case 1: // 首字母
                    return `首字母: ${target.charAt(0)}`;
                case 2: // 字母数
                    return `共 ${target.length} 个字符`;
                case 3: // 部分显示（显示一半）
                    const half = Math.floor(target.length / 2);
                    return `部分: ${target.substring(0, half)}___`;
                default:
                    return '';
            }
        }

        // 检查拼写
        checkSpelling() {
            if (!this.state.isActive || !this.currentWordObj) {
                showToast('请先开始训练', 'warning');
                return;
            }

            const input = document.getElementById('spellInput');
            const userAnswer = input.value.trim();
            if (!userAnswer) {
                showToast('请输入拼写', 'warning');
                return;
            }

            const isEnToCn = appData.mode === 'en_to_cn';
            const correct = isEnToCn ? this.currentWordObj.english : this.currentWordObj.chinese;
            const isCorrect = this.compareSpelling(userAnswer, correct);

            this.state.totalCount++;
            if (isCorrect) {
                this.state.correctCount++;
                this.state.streak++;
                if (this.state.streak > this.state.bestStreak) {
                    this.state.bestStreak = this.state.streak;
                }
                document.getElementById('spellFeedback').innerHTML = `
                    <span style="color:#27ae60;font-weight:600;">✅ 正确！ 继续加油！</span>
                    <span style="color:#888;font-size:13px;margin-left:12px;">🔥 连击 ${this.state.streak}</span>
                `;
                // 正确时自动下一题（延迟）
                setTimeout(() => this.nextSpelling(), 600);
            } else {
                this.state.streak = 0;
                this.state.mistakes.push({
                    word: this.currentWordObj,
                    userAnswer: userAnswer,
                    correct: correct,
                    time: new Date().toLocaleTimeString(),
                });
                document.getElementById('spellFeedback').innerHTML = `
                    <span style="color:#e74c3c;font-weight:600;">❌ 拼写错误</span>
                    <div style="margin-top:4px;color:#555;">
                        你的答案: <span style="color:#e74c3c;">${userAnswer}</span>
                        <br>正确答案: <span style="color:#27ae60;font-weight:600;">${correct}</span>
                    </div>
                `;
                // 显示错误列表
                this.renderMistakes();
                input.value = '';
                input.focus();
            }

            // 记录历史
            this.state.history.push({
                word: this.currentWordObj,
                userAnswer: userAnswer,
                correct: correct,
                isCorrect: isCorrect,
                time: new Date().toLocaleTimeString(),
            });

            this.renderStats();
            this.renderHistory();
        }

        // 比较拼写（支持模糊匹配）
        compareSpelling(user, correct) {
            const normalize = s => s.trim().toLowerCase().replace(/[^a-z\u4e00-\u9fff]/g, '');
            const un = normalize(user);
            const cn = normalize(correct);
            
            if (un === cn) return true;
            
            // 中译英模式：检查是否包含关键词
            if (appData.mode === 'cn_to_en') {
                const userWords = un.split(/\s+/);
                const correctWords = cn.split(/\s+/);
                const matched = userWords.filter(w => correctWords.some(cw => cw.includes(w) || w.includes(cw)));
                if (matched.length >= Math.min(userWords.length, correctWords.length) * 0.6) return true;
            }
            
            // 英译中模式：检查拼音相似度（简化）
            if (appData.mode === 'en_to_cn') {
                // 检查是否包含关键字符
                if (un.length > 0 && cn.length > 0) {
                    const common = un.split('').filter(c => cn.includes(c));
                    if (common.length / Math.max(un.length, cn.length) > 0.5) return true;
                }
            }
            
            return false;
        }

        // 设置提示等级
        setHintLevel(level) {
            this.state.hintLevel = level;
            document.querySelectorAll('[data-level]').forEach(btn => {
                btn.classList.toggle('active', parseInt(btn.dataset.level) === level);
                btn.style.background = parseInt(btn.dataset.level) === level ? '#1a73e8' : '';
                btn.style.color = parseInt(btn.dataset.level) === level ? 'white' : '';
            });
            document.getElementById('spellHintLevel').textContent = `当前: ${['无','首字母','字母数','部分显示'][level]}`;
            if (this.currentWordObj) {
                this.updateSpellingDisplay();
            }
        }

        // ============================================================
        // 语音功能
        // ============================================================

        speakWord() {
            if (!this.currentWordObj) return;
            const word = this.currentWordObj;
            const isEnToCn = appData.mode === 'en_to_cn';
            const text = isEnToCn ? word.english : word.chinese;
            
            if (this.speechSynth) {
                this.speechSynth.cancel();
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.lang = isEnToCn ? 'en-US' : 'zh-CN';
                utterance.rate = 0.8;
                utterance.pitch = 1;
                const voices = this.speechSynth.getVoices();
                const voice = voices.find(v => v.lang.startsWith(isEnToCn ? 'en' : 'zh'));
                if (voice) utterance.voice = voice;
                this.speechSynth.speak(utterance);
                showToast(`🔊 听音: ${text}`, 'info');
            } else {
                showToast('浏览器不支持语音合成', 'error');
            }
        }

        // ============================================================
        // 渲染辅助
        // ============================================================

        renderStats() {
            const total = this.state.totalCount;
            const correct = this.state.correctCount;
            const accuracy = total > 0 ? Math.round(correct / total * 100) : 0;
            
            document.getElementById('spellCorrect').textContent = correct;
            document.getElementById('spellTotal').textContent = total;
            document.getElementById('spellStreak').textContent = this.state.streak;
            document.getElementById('spellBest').textContent = this.state.bestStreak;
            document.getElementById('spellAccuracy').textContent = total > 0 ? `${accuracy}%` : '0%';
        }

        renderMistakes() {
            const container = document.getElementById('spellMistakes');
            const list = document.getElementById('spellMistakesList');
            if (this.state.mistakes.length === 0) {
                container.style.display = 'none';
                return;
            }
            container.style.display = 'block';
            list.innerHTML = this.state.mistakes.slice(-10).reverse().map(m => `
                <div style="padding:4px 0;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;">
                    <span>${m.word.english} → ${m.correct}</span>
                    <span style="color:#e74c3c;">✗ ${m.userAnswer}</span>
                    <span style="color:#888;font-size:12px;">${m.time}</span>
                </div>
            `).join('');
        }

        renderHistory() {
            const container = document.getElementById('spellHistory');
            const list = document.getElementById('spellHistoryList');
            if (this.state.history.length === 0) {
                container.style.display = 'none';
                return;
            }
            container.style.display = 'block';
            const recent = this.state.history.slice(-10).reverse();
            list.innerHTML = recent.map(h => `
                <div style="padding:3px 0;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;font-size:13px;">
                    <span>${h.word.english}</span>
                    <span>${h.userAnswer}</span>
                    <span style="color:${h.isCorrect ? '#27ae60' : '#e74c3c'};">${h.isCorrect ? '✅' : '❌'}</span>
                </div>
            `).join('');
        }

        updateDisplay(display, hint) {
            document.getElementById('spellDisplay').textContent = display;
            document.getElementById('spellHint').textContent = hint || '';
        }

        resetStats() {
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
            document.getElementById('spellInput').value = '';
            document.getElementById('spellFeedback').innerHTML = '';
            showToast('已重置统计数据', 'info');
        }

        // ============================================================
        // 工具函数
        // ============================================================

        shuffleArray(arr) {
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            return arr;
        }

        // 插件销毁
        destroy() {
            this.initialized = false;
            this.state.isActive = false;
            if (this.speechSynth) {
                this.speechSynth.cancel();
            }
            console.log(`[${PLUGIN_NAME}] 已卸载`);
        }
    }

    // ============================================================
    // 导出插件实例
    // ============================================================

    // 创建全局插件实例
    window.spellingPlugin = new SpellingPlugin();

    // 注册到插件系统
    window.registerPlugin = function() {
        const pluginInfo = {
            id: PLUGIN_ID,
            name: PLUGIN_NAME,
            version: PLUGIN_VERSION,
            description: '听音拼写训练，加强单词记忆',
            init: () => window.spellingPlugin.init(),
            destroy: () => window.spellingPlugin.destroy(),
            refresh: () => window.spellingPlugin.refreshWords(),
        };
        
        // 存储插件信息
        if (!window.plugins) window.plugins = {};
        window.plugins[PLUGIN_ID] = pluginInfo;
        
        console.log(`✅ 插件 "${PLUGIN_NAME}" 已注册`);
        return pluginInfo;
    };

    // 自动注册
    window.registerPlugin();

    // 当DOM加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => window.spellingPlugin.init(), 100);
        });
    } else {
        setTimeout(() => window.spellingPlugin.init(), 100);
    }

    console.log(`🔌 ${PLUGIN_NAME} v${PLUGIN_VERSION} 加载完成`);

})();

