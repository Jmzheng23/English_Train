// ============================================================
// 疾病诊断训练插件 (Disease Diagnosis Trainer)
// 功能：复现R代码的所有功能，以特殊词书形式存储
// ============================================================

(function() {
    'use strict';

    const PLUGIN_ID = 'disease-diagnosis-trainer';
    const PLUGIN_NAME = '🏥 疾病诊断训练';
    const PLUGIN_VERSION = '1.0.0';

    // 插件状态
    let state = {
        formulas: [],
        currentIndex: 0,
        usedFormulas: [],
        currentFormula: null,
        history: [],
        correctCount: 0,
        totalCount: 0,
        treatmentCorrectCount: 0,
        markedDiseases: [],
        orderMode: 'sequential',
        isActive: false,
    };

    // ============================================================
    // 数据存储 - 作为特殊词书
    // ============================================================

    const DISEASE_NOTEBOOK_PREFIX = '🩺疾病_';
    const DISEASE_NOTEBOOK_TAG = 'disease_diagnosis';

    function getDiseaseNotebookName(name) {
        return DISEASE_NOTEBOOK_PREFIX + name;
    }

    function isDiseaseNotebook(nb) {
        return nb && nb.tags && nb.tags.includes(DISEASE_NOTEBOOK_TAG);
    }

    // 从特殊词书加载数据
    function loadFromNotebook(notebookId) {
        const nb = getNotebook(notebookId);
        if (!nb || !isDiseaseNotebook(nb)) return false;
        
        // 从词书的words中恢复公式数据
        const formulas = nb.words.map(w => {
            const parts = w.full_pair ? w.full_pair.split('|') : [];
            return {
                disease: w.english || '',
                symptoms: parts[0] || '',
                treatment: parts[1] || '',
                full_formula: w.chinese || '',
                star: w.star || false,
                easy: w.easy || false,
                marked: w.marked || false,
            };
        });
        
        state.formulas = formulas;
        state.currentIndex = 0;
        state.usedFormulas = [];
        state.history = [];
        state.correctCount = 0;
        state.totalCount = 0;
        state.treatmentCorrectCount = 0;
        state.markedDiseases = formulas.filter(f => f.marked).map(f => f.disease);
        
        // 恢复标记
        formulas.forEach(f => {
            if (f.marked && !state.markedDiseases.includes(f.disease)) {
                state.markedDiseases.push(f.disease);
            }
        });
        
        return true;
    }

    // 保存到特殊词书
    function saveToNotebook(name, formulas) {
        const nbName = getDiseaseNotebookName(name || '未命名');
        const words = formulas.map(f => ({
            english: f.disease,
            chinese: f.full_formula || `${f.symptoms} —— ${f.treatment || ''}`,
            full_pair: `${f.symptoms}|${f.treatment || ''}`,
            star: f.star || false,
            easy: f.easy || false,
            marked: f.marked || false,
        }));
        
        // 删除旧的同名词书
        const existing = appData.notebooks.findIndex(nb => 
            nb.name === nbName && isDiseaseNotebook(nb)
        );
        if (existing !== -1) {
            appData.notebooks.splice(existing, 1);
        }
        
        const nb = createNotebook(nbName, [DISEASE_NOTEBOOK_TAG, '医学', '诊断'], '#e74c3c', words);
        return nb;
    }

    // ============================================================
    // 解析诊断公式
    // ============================================================

    function parseFormulas(text) {
        const lines = text.split('\n').filter(l => l.trim());
        const formulaLines = lines.filter(l => l.includes('='));
        const parsed = [];
        
        for (let line of formulaLines) {
            line = line.trim();
            const parts = line.split('=');
            if (parts.length >= 2) {
                let disease = parts[0].trim();
                // 去除编号
                disease = disease.replace(/^[0-9\.]+\s*/, '');
                disease = disease.replace(/^[①②③④⑤⑥⑦⑧⑨⑩]+\s*/, '');
                disease = disease.replace(/[\s]*[:punct:]*$/, '');
                
                const rest = parts.slice(1).join('=').trim();
                let symptoms = rest;
                let treatment = '';
                
                if (rest.includes('——')) {
                    const splitParts = rest.split('——');
                    symptoms = splitParts[0].trim();
                    treatment = splitParts.slice(1).join('——').trim();
                }
                
                parsed.push({
                    disease: disease,
                    full_formula: line,
                    symptoms: symptoms,
                    treatment: treatment,
                    star: false,
                    easy: false,
                    marked: false,
                });
            }
        }
        return parsed;
    }

    // ============================================================
    // 插件UI模板
    // ============================================================

    function getPluginHTML() {
        return `
            <div id="disease-plugin" style="padding:20px;background:white;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
                <!-- 头部 -->
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
                    <div>
                        <h3 style="color:#1a1a2e;">🏥 疾病诊断训练</h3>
                        <span style="font-size:13px;color:#888;">症状 → 诊断 → 治疗方案</span>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <button class="btn btn-primary btn-sm" onclick="diseasePlugin.toggleTraining()">
                            <span id="diseaseToggleBtn">▶ 开始训练</span>
                        </button>
                        <button class="btn btn-success btn-sm" onclick="document.getElementById('diseaseFileInput').click()">📤 导入文档</button>
                        <input type="file" id="diseaseFileInput" accept=".txt,.docx" style="display:none" onchange="diseasePlugin.handleFileUpload(event)">
                        <button class="btn btn-outline btn-sm" onclick="diseasePlugin.resetAll()">🔄 重置</button>
                    </div>
                </div>

                <!-- 进度信息 -->
                <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px;font-size:13px;color:#888;">
                    <span id="diseaseProgress">准备开始</span>
                    <div style="display:flex;gap:16px;">
                        <span>✅ 诊断: <span id="diseaseDiagCorrect">0</span>/<span id="diseaseTotal">0</span></span>
                        <span>💊 治疗: <span id="diseaseTxCorrect">0</span>/<span id="diseaseTxTotal">0</span></span>
                        <span>⭐ 标记: <span id="diseaseMarkedCount">0</span></span>
                    </div>
                </div>

                <!-- 训练设置 -->
                <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px;padding:8px 12px;background:#f7f9fc;border-radius:6px;">
                    <label style="display:flex;align-items:center;gap:4px;font-size:13px;cursor:pointer;">
                        <input type="radio" name="diseaseOrder" value="sequential" checked onchange="diseasePlugin.setOrder('sequential')"> 顺序
                    </label>
                    <label style="display:flex;align-items:center;gap:4px;font-size:13px;cursor:pointer;">
                        <input type="radio" name="diseaseOrder" value="random" onchange="diseasePlugin.setOrder('random')"> 乱序
                    </label>
                    <span style="color:#aaa;margin:0 4px;">|</span>
                    <span style="font-size:12px;color:#666;" id="diseaseFormulaCount">共 0 个疾病</span>
                </div>

                <!-- 主训练区 -->
                <div style="background:#f7f9fc;border-radius:8px;padding:24px;text-align:center;min-height:120px;display:flex;flex-direction:column;justify-content:center;align-items:center;">
                    <div id="diseaseSymptoms" style="font-size:22px;font-weight:500;color:#1a1a2e;min-height:50px;">
                        🩺 请导入诊断公式文档
                    </div>
                    <div id="diseaseHint" style="font-size:15px;color:#888;margin-top:8px;min-height:30px;">
                        格式：疾病 = 症状 —— ①治疗1 + ②治疗2
                    </div>
                </div>

                <!-- 输入区 -->
                <div style="margin-top:16px;display:grid;gap:12px;">
                    <div>
                        <label style="font-size:13px;font-weight:600;color:#555;">💊 诊断名称</label>
                        <div style="display:flex;gap:10px;margin-top:4px;">
                            <input type="text" id="diseaseDiagnosisInput" placeholder="请输入疾病名称..." 
                                   style="flex:1;padding:10px 14px;border:2px solid #e2e8f0;border-radius:6px;font-size:15px;"
                                   onkeydown="if(event.key==='Enter') diseasePlugin.submit()">
                            <button class="btn btn-primary" onclick="diseasePlugin.submit()">✅ 提交</button>
                        </div>
                    </div>
                    <div>
                        <label style="font-size:13px;font-weight:600;color:#555;">💊 治疗方案</label>
                        <div style="display:flex;gap:10px;margin-top:4px;">
                            <input type="text" id="diseaseTreatmentInput" placeholder="如：①一般治疗 ②药物治疗..." 
                                   style="flex:1;padding:10px 14px;border:2px solid #e2e8f0;border-radius:6px;font-size:15px;"
                                   onkeydown="if(event.key==='Enter') diseasePlugin.submit()">
                            <button class="btn btn-outline" onclick="diseasePlugin.nextQuestion()">➡️ 下一题</button>
                        </div>
                    </div>
                </div>

                <!-- 结果区 -->
                <div id="diseaseResultBox" style="margin-top:12px;padding:14px 18px;border-radius:8px;background:#f7f9fc;min-height:50px;">
                    <span style="color:#888;">输入诊断和治疗方案后点击「提交」</span>
                </div>

                <!-- 正确答案 -->
                <div id="diseaseAnswerBox" style="margin-top:8px;padding:12px 16px;border-radius:6px;background:#f0f4f8;display:none;">
                    <div style="font-size:13px;color:#555;">
                        <div><strong>✅ 正确诊断：</strong><span id="diseaseCorrectDiag"></span></div>
                        <div><strong>💊 参考治疗：</strong><span id="diseaseCorrectTx"></span></div>
                        <div><strong>📝 完整公式：</strong><span id="diseaseFullFormula" style="font-size:12px;color:#888;"></span></div>
                    </div>
                </div>

                <!-- 标记操作 -->
                <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                    <button class="btn btn-sm btn-success" onclick="diseasePlugin.markCurrent()">⭐ 标记</button>
                    <button class="btn btn-sm btn-danger" onclick="diseasePlugin.unmarkCurrent()">❌ 取消标记</button>
                    <button class="btn btn-sm btn-warning" onclick="diseasePlugin.practiceMarked()">📖 练习标记</button>
                    <button class="btn btn-sm btn-outline" onclick="diseasePlugin.exportMarks()">📤 导出标记</button>
                </div>

                <!-- 错误记录 -->
                <div id="diseaseMistakes" style="margin-top:12px;display:none;">
                    <h4 style="font-size:14px;color:#e74c3c;">❌ 错误记录</h4>
                    <div id="diseaseMistakesList" style="max-height:100px;overflow-y:auto;font-size:13px;color:#555;background:#f7f9fc;border-radius:6px;padding:8px;"></div>
                </div>

                <!-- 历史记录 -->
                <div id="diseaseHistory" style="margin-top:12px;display:none;">
                    <h4 style="font-size:14px;color:#888;">📋 训练记录</h4>
                    <div id="diseaseHistoryList" style="max-height:120px;overflow-y:auto;font-size:13px;color:#555;background:#f7f9fc;border-radius:6px;padding:8px;"></div>
                </div>
            </div>
        `;
    }

    // ============================================================
    // 插件核心类
    // ============================================================

    class DiseasePlugin {
        constructor() {
            this.state = state;
            this.initialized = false;
            this.isTraining = false;
            this.mistakes = [];
            this.history = [];
        }

        init() {
            if (this.initialized) return;
            this.render();
            this.bindEvents();
            this.initialized = true;
            // 检查是否有疾病词书
            this.loadFromExistingNotebook();
            console.log('[🏥 疾病诊断训练] 初始化完成 v' + PLUGIN_VERSION);
        }

        render() {
            const container = document.getElementById('pluginContainer');
            if (!container) {
                // 如果没有插件容器，使用pluginSlot
                const slot = document.getElementById('pluginSlot');
                if (slot) {
                    slot.innerHTML = getPluginHTML();
                }
                return;
            }
            container.innerHTML = getPluginHTML();
            this.updateStats();
            this.updateProgress();
        }

        bindEvents() {
            // 监听词书切换
            document.addEventListener('click', (e) => {
                if (e.target.closest('.tab-item') || e.target.closest('.notebook-item')) {
                    setTimeout(() => {
                        if (this.isTraining) {
                            this.loadFromExistingNotebook();
                        }
                    }, 300);
                }
            });
        }

        // ============================================================
        // 数据加载
        // ============================================================

        loadFromExistingNotebook() {
            // 查找疾病词书
            const diseaseNbs = appData.notebooks.filter(nb => isDiseaseNotebook(nb));
            if (diseaseNbs.length > 0) {
                // 使用最新的疾病词书
                const nb = diseaseNbs[diseaseNbs.length - 1];
                if (loadFromNotebook(nb.id)) {
                    this.render();
                    this.updateStats();
                    this.updateProgress();
                    this.updateDisplay('🩺 已加载词书', `共 ${this.state.formulas.length} 个疾病`);
                    showToast(`✅ 已加载疾病词书: ${nb.name}`, 'success');
                    return true;
                }
            }
            return false;
        }

        // ============================================================
        // 文件导入
        // ============================================================

        handleFileUpload(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                let text = e.target.result;
                if (file.name.endsWith('.docx')) {
                    showToast('请使用 .txt 格式，或复制内容粘贴', 'warning');
                    return;
                }
                const formulas = parseFormulas(text);
                if (formulas.length === 0) {
                    showToast('未能解析出疾病公式', 'error');
                    return;
                }
                this.importFormulas(formulas, file.name.replace(/\.[^/.]+$/, ''));
            };
            reader.readAsText(file);
            event.target.value = '';
        }

        importFormulas(formulas, name) {
            // 保存到特殊词书
            const nb = saveToNotebook(name || '未命名疾病库', formulas);
            this.state.formulas = formulas;
            this.state.currentIndex = 0;
            this.state.usedFormulas = [];
            this.state.history = [];
            this.state.correctCount = 0;
            this.state.totalCount = 0;
            this.state.treatmentCorrectCount = 0;
            this.state.markedDiseases = [];
            this.mistakes = [];
            this.history = [];
            this.isTraining = false;
            
            // 设置当前词书
            appData.currentNotebookId = nb.id;
            
            this.render();
            this.updateStats();
            this.updateProgress();
            this.updateDisplay('📚 导入成功', `共 ${formulas.length} 个疾病`);
            showToast(`✅ 成功导入 ${formulas.length} 个疾病到 "${nb.name}"`, 'success');
            
            // 获取第一题
            this.getNewQuestion();
            saveData();
        }

        // ============================================================
        // 核心训练逻辑
        // ============================================================

        toggleTraining() {
            if (!this.isTraining) {
                this.startTraining();
            } else {
                this.stopTraining();
            }
        }

        startTraining() {
            if (this.state.formulas.length === 0) {
                showToast('请先导入诊断公式文档', 'warning');
                return;
            }
            this.isTraining = true;
            this.state.totalCount = 0;
            this.state.correctCount = 0;
            this.state.treatmentCorrectCount = 0;
            this.mistakes = [];
            this.history = [];
            document.getElementById('diseaseToggleBtn').textContent = '⏹ 停止训练';
            showToast('🎯 疾病诊断训练开始！', 'success');
            this.getNewQuestion();
            this.updateStats();
        }

        stopTraining() {
            this.isTraining = false;
            document.getElementById('diseaseToggleBtn').textContent = '▶ 开始训练';
            this.updateDisplay('⏸ 已暂停', '点击"开始训练"继续');
            document.getElementById('diseaseDiagnosisInput').disabled = true;
            document.getElementById('diseaseTreatmentInput').disabled = true;
            showToast('已暂停训练', 'info');
        }

        setOrder(mode) {
            this.state.orderMode = mode;
            this.state.currentIndex = 0;
            this.state.usedFormulas = [];
            if (this.isTraining) {
                this.getNewQuestion();
            }
            showToast(`已切换到${mode === 'sequential' ? '顺序' : '乱序'}模式`, 'info');
        }

        getNewQuestion() {
            const formulas = this.state.formulas;
            if (formulas.length === 0) return null;
            
            if (this.state.orderMode === 'sequential') {
                if (this.state.currentIndex >= formulas.length) {
                    this.state.currentIndex = 0;
                    showToast('已到达列表末尾，重新开始！', 'warning');
                }
                const formula = formulas[this.state.currentIndex];
                this.state.currentFormula = formula;
                this.state.currentIndex++;
                this.updateDisplay(formula);
                return formula;
            } else {
                const unused = formulas.filter(f => !this.state.usedFormulas.includes(f.disease));
                if (unused.length === 0) {
                    this.state.usedFormulas = [];
                    showToast('所有疾病已完成，重新开始乱序！', 'warning');
                    const first = formulas[0];
                    this.state.currentFormula = first;
                    this.state.usedFormulas.push(first.disease);
                    this.updateDisplay(first);
                    return first;
                }
                const idx = Math.floor(Math.random() * unused.length);
                const formula = unused[idx];
                this.state.currentFormula = formula;
                this.state.usedFormulas.push(formula.disease);
                this.updateDisplay(formula);
                return formula;
            }
        }

        updateDisplay(formula) {
            if (!formula) {
                document.getElementById('diseaseSymptoms').textContent = '🩺 没有更多题目';
                document.getElementById('diseaseHint').textContent = '点击"重置"重新开始';
                return;
            }
            document.getElementById('diseaseSymptoms').textContent = formula.symptoms || '（无症状描述）';
            document.getElementById('diseaseHint').textContent = '请根据症状判断疾病并给出治疗方案';
            document.getElementById('diseaseDiagnosisInput').value = '';
            document.getElementById('diseaseTreatmentInput').value = '';
            document.getElementById('diseaseDiagnosisInput').disabled = false;
            document.getElementById('diseaseTreatmentInput').disabled = false;
            document.getElementById('diseaseDiagnosisInput').focus();
            document.getElementById('diseaseResultBox').innerHTML = '<span style="color:#888;">输入诊断和治疗方案后点击「提交」</span>';
            document.getElementById('diseaseAnswerBox').style.display = 'none';
            this.updateProgress();
        }

        // ============================================================
        // 提交答案
        // ============================================================

        submit() {
            if (!this.isTraining) {
                showToast('请先开始训练', 'warning');
                return;
            }
            const formula = this.state.currentFormula;
            if (!formula) {
                showToast('没有当前题目', 'warning');
                return;
            }

            const userDiagnosis = document.getElementById('diseaseDiagnosisInput').value.trim();
            const userTreatment = document.getElementById('diseaseTreatmentInput').value.trim();

            if (!userDiagnosis) {
                showToast('请输入诊断名称！', 'warning');
                return;
            }

            // 检查诊断
            const isDiagCorrect = this.checkDiagnosis(userDiagnosis, formula.disease);
            
            // 评估治疗
            const txEval = this.evaluateTreatment(userTreatment, formula.treatment);

            // 更新统计
            this.state.totalCount++;
            if (isDiagCorrect) this.state.correctCount++;
            if (txEval.score >= 60) this.state.treatmentCorrectCount++;

            // 记录错误
            if (!isDiagCorrect || txEval.score < 60) {
                this.mistakes.push({
                    disease: formula.disease,
                    userDiagnosis: userDiagnosis,
                    correctDiagnosis: formula.disease,
                    userTreatment: userTreatment,
                    correctTreatment: formula.treatment,
                    diagCorrect: isDiagCorrect,
                    txScore: txEval.score,
                    time: new Date().toLocaleTimeString(),
                });
            }

            // 记录历史
            this.history.push({
                disease: formula.disease,
                userDiagnosis: userDiagnosis,
                correctDiagnosis: formula.disease,
                userTreatment: userTreatment,
                correctTreatment: formula.treatment,
                diagCorrect: isDiagCorrect,
                txScore: txEval.score,
                time: new Date().toLocaleTimeString(),
            });

            // 显示结果
            this.showResult(formula, userDiagnosis, userTreatment, isDiagCorrect, txEval);
            this.updateStats();
            this.renderMistakes();
            this.renderHistory();
        }

        checkDiagnosis(user, correct) {
            const normalize = s => s.trim().toLowerCase().replace(/[（(].*?[）)]/g, '').replace(/[，,、。.！!？?；;：:""''（）()\s]+/g, '');
            const un = normalize(user);
            const cn = normalize(correct);
            if (un === cn) return true;
            if (un.includes(cn) || cn.includes(un)) return true;
            
            // 缩写检查
            const abbr = {
                'copd': '慢性阻塞性肺疾病',
                'ards': '急性呼吸窘迫综合征',
                'itp': '原发免疫性血小板减少症',
                'dka': '酮症酸中毒',
                'hhs': '高渗高血糖综合征'
            };
            if (un in abbr && cn.includes(abbr[un])) return true;
            
            // 关键词匹配
            const userWords = un.split(/\s+/);
            const correctWords = cn.split(/\s+/);
            const matched = userWords.filter(w => correctWords.some(cw => cw.includes(w) || w.includes(cw)));
            if (matched.length >= Math.min(userWords.length, correctWords.length) * 0.5) return true;
            
            return false;
        }

        evaluateTreatment(user, correct) {
            if (!correct || correct === '') {
                return { score: 0, feedback: '无参考治疗方案' };
            }
            if (!user || user === '') {
                return { score: 0, feedback: '未输入治疗方案' };
            }

            const extractItems = (text) => {
                let items = text.match(/[①②③④⑤⑥⑦⑧⑨⑩][^①②③④⑤⑥⑦⑧⑨⑩]*/g);
                if (!items || items.length === 0) {
                    items = text.match(/\d+[^\d]*/g);
                }
                if (!items || items.length === 0) {
                    items = text.split(/[;；+＋]/);
                }
                return (items || []).map(s => s.trim()).filter(s => s);
            };

            const userItems = extractItems(user);
            const correctItems = extractItems(correct);

            if (correctItems.length === 0) return { score: 0, feedback: '参考治疗方案格式异常' };

            const matchedItems = [];
            for (const uItem of userItems) {
                for (const cItem of correctItems) {
                    const uKeywords = uItem.replace(/[①②③④⑤⑥⑦⑧⑨⑩\d]+/g, '').trim();
                    const cKeywords = cItem.replace(/[①②③④⑤⑥⑦⑧⑨⑩\d]+/g, '').trim();
                    if (uKeywords && cKeywords && 
                        (cKeywords.includes(uKeywords) || uKeywords.includes(cKeywords) ||
                         uKeywords.split(/\s+/).some(k => cKeywords.includes(k)))) {
                        if (!matchedItems.includes(cItem)) {
                            matchedItems.push(cItem);
                        }
                        break;
                    }
                }
            }

            const score = Math.round(matchedItems.length / correctItems.length * 100);
            let feedback = score >= 80 ? '治疗方案匹配度良好！' :
                          score >= 60 ? '治疗方案部分匹配，请参考完整方案。' :
                          score >= 40 ? '治疗方案匹配度一般，建议加强学习。' :
                          score > 0 ? '治疗方案匹配度较低，请仔细学习参考方案。' :
                          '治疗方案不匹配，请认真学习标准治疗方案。';

            return { score, feedback, matched: matchedItems };
        }

        showResult(formula, userDiag, userTx, isDiagCorrect, txEval) {
            const resultBox = document.getElementById('diseaseResultBox');
            const answerBox = document.getElementById('diseaseAnswerBox');
            
            let diagStatus = isDiagCorrect ? '✅ 正确' : '❌ 错误';
            let diagColor = isDiagCorrect ? '#27ae60' : '#e74c3c';
            
            let overall = '';
            if (isDiagCorrect && txEval.score >= 80) {
                overall = '🎉 优秀！诊断正确，治疗方案匹配良好';
            } else if (isDiagCorrect && txEval.score >= 60) {
                overall = '👍 良好！诊断正确，治疗方案基本匹配';
            } else if (isDiagCorrect) {
                overall = '⚠️ 诊断正确，但治疗方案需要加强';
            } else if (txEval.score >= 80) {
                overall = '⚠️ 治疗方案匹配良好，但诊断不正确';
            } else {
                overall = '💪 诊断和治疗都需要加强学习';
            }

            resultBox.innerHTML = `
                <div style="font-size:14px;line-height:1.8;">
                    <div><strong>诊断：</strong><span style="color:${diagColor}">${diagStatus}</span></div>
                    <div><strong>治疗匹配度：</strong>${txEval.score}% - ${txEval.feedback}</div>
                    <div><strong>综合评定：</strong>${overall}</div>
                    ${txEval.matched && txEval.matched.length > 0 ? `<div style="font-size:12px;color:#888;">匹配项：${txEval.matched.join('、')}</div>` : ''}
                </div>
            `;

            // 显示正确答案
            document.getElementById('diseaseCorrectDiag').textContent = formula.disease;
            document.getElementById('diseaseCorrectTx').textContent = formula.treatment || '（无参考方案）';
            document.getElementById('diseaseFullFormula').textContent = formula.full_formula;
            answerBox.style.display = 'block';

            // 自动下一题（如果正确）
            if (isDiagCorrect && txEval.score >= 80) {
                setTimeout(() => this.nextQuestion(), 800);
            }
        }

        nextQuestion() {
            if (!this.isTraining) return;
            this.getNewQuestion();
            document.getElementById('diseaseAnswerBox').style.display = 'none';
        }

        // ============================================================
        // 标记功能
        // ============================================================

        markCurrent() {
            const formula = this.state.currentFormula;
            if (!formula) { showToast('没有当前题目', 'warning'); return; }
            if (formula.marked) {
                showToast('该疾病已被标记', 'warning');
                return;
            }
            formula.marked = true;
            if (!this.state.markedDiseases.includes(formula.disease)) {
                this.state.markedDiseases.push(formula.disease);
            }
            // 同步到词书
            this.syncToNotebook();
            this.updateStats();
            showToast(`⭐ 已标记: ${formula.disease}`, 'success');
        }

        unmarkCurrent() {
            const formula = this.state.currentFormula;
            if (!formula) { showToast('没有当前题目', 'warning'); return; }
            if (!formula.marked) {
                showToast('该疾病未被标记', 'warning');
                return;
            }
            formula.marked = false;
            this.state.markedDiseases = this.state.markedDiseases.filter(d => d !== formula.disease);
            this.syncToNotebook();
            this.updateStats();
            showToast(`取消标记: ${formula.disease}`, 'info');
        }

        practiceMarked() {
            const marked = this.state.formulas.filter(f => f.marked);
            if (marked.length === 0) {
                showToast('没有标记的疾病', 'warning');
                return;
            }
            // 创建临时列表
            const tempFormulas = marked.map(f => ({...f}));
            // 用标记的疾病替换当前列表
            const originalFormulas = this.state.formulas;
            this.state.formulas = tempFormulas;
            this.state.currentIndex = 0;
            this.state.usedFormulas = [];
            this.isTraining = true;
            document.getElementById('diseaseToggleBtn').textContent = '⏹ 停止训练';
            showToast(`📖 开始练习 ${marked.length} 个标记疾病`, 'success');
            this.getNewQuestion();
            this.updateStats();
            // 恢复原列表（练习完后）
            // 这里简化处理，练习完再恢复
            const self = this;
            setTimeout(() => {
                self.state.formulas = originalFormulas;
            }, 1000);
        }

        exportMarks() {
            const marked = this.state.formulas.filter(f => f.marked);
            if (marked.length === 0) {
                showToast('没有标记的疾病', 'warning');
                return;
            }
            let text = '疾病名称\t症状\t治疗方案\t完整公式\n';
            marked.forEach(f => {
                text += `${f.disease}\t${f.symptoms}\t${f.treatment || '无'}\t${f.full_formula}\n`;
            });
            showModal('📤 导出标记疾病', `
                <p style="margin-bottom:12px;color:#666;">共 ${marked.length} 个标记疾病</p>
                <textarea readonly style="width:100%;min-height:150px;padding:10px;border:2px solid #e2e8f0;border-radius:6px;font-family:monospace;font-size:13px;">${text}</textarea>
                <div style="margin-top:12px;font-size:12px;color:#888;">提示：Ctrl+A 全选，Ctrl+C 复制</div>
                <div class="btn-row"><button class="btn btn-outline" onclick="closeModal()">关闭</button></div>
            `);
        }

        syncToNotebook() {
            // 同步标记到词书
            const diseaseNbs = appData.notebooks.filter(nb => isDiseaseNotebook(nb));
            if (diseaseNbs.length > 0) {
                const nb = diseaseNbs[diseaseNbs.length - 1];
                nb.words.forEach(w => {
                    const formula = this.state.formulas.find(f => f.disease === w.english);
                    if (formula) {
                        w.marked = formula.marked;
                        w.star = formula.marked;
                    }
                });
                saveData();
            }
        }

        // ============================================================
        // 重置
        // ============================================================

        resetAll() {
            if (!confirm('确定要重置所有训练数据吗？')) return;
            this.state.currentIndex = 0;
            this.state.usedFormulas = [];
            this.state.history = [];
            this.state.correctCount = 0;
            this.state.totalCount = 0;
            this.state.treatmentCorrectCount = 0;
            this.mistakes = [];
            this.history = [];
            this.isTraining = false;
            document.getElementById('diseaseToggleBtn').textContent = '▶ 开始训练';
            this.updateDisplay('🔄 已重置', '点击"开始训练"重新开始');
            this.updateStats();
            this.renderMistakes();
            this.renderHistory();
            document.getElementById('diseaseResultBox').innerHTML = '<span style="color:#888;">已重置，点击"开始训练"重新开始</span>';
            document.getElementById('diseaseAnswerBox').style.display = 'none';
            showToast('已重置所有数据', 'info');
        }

        // ============================================================
        // 渲染辅助
        // ============================================================

        updateStats() {
            const total = this.state.totalCount;
            const diagCorrect = this.state.correctCount;
            const txCorrect = this.state.treatmentCorrectCount;
            const marked = this.state.formulas.filter(f => f.marked).length;
            
            document.getElementById('diseaseDiagCorrect').textContent = diagCorrect;
            document.getElementById('diseaseTotal').textContent = total;
            document.getElementById('diseaseTxCorrect').textContent = txCorrect;
            document.getElementById('diseaseTxTotal').textContent = total;
            document.getElementById('diseaseMarkedCount').textContent = marked;
            document.getElementById('diseaseFormulaCount').textContent = `共 ${this.state.formulas.length} 个疾病`;
        }

        updateProgress() {
            const total = this.state.formulas.length;
            const done = this.state.orderMode === 'sequential' ? 
                this.state.currentIndex : 
                this.state.usedFormulas.length;
            const progress = total > 0 ? Math.min(100, Math.round(done / total * 100)) : 0;
            document.getElementById('diseaseProgress').textContent = 
                total > 0 ? `进度: ${done}/${total}` : '准备开始';
        }

        renderMistakes() {
            const container = document.getElementById('diseaseMistakes');
            const list = document.getElementById('diseaseMistakesList');
            if (!container || !list) return;
            if (this.mistakes.length === 0) {
                container.style.display = 'none';
                return;
            }
            container.style.display = 'block';
            list.innerHTML = this.mistakes.slice(-10).reverse().map(m => `
                <div style="padding:4px 0;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;font-size:13px;">
                    <span>${m.disease}</span>
                    <span style="color:${m.diagCorrect ? '#27ae60' : '#e74c3c'};">${m.diagCorrect ? '✅' : '❌'}</span>
                    <span style="color:#888;">治疗 ${m.txScore}%</span>
                    <span style="color:#888;font-size:11px;">${m.time}</span>
                </div>
            `).join('');
        }

        renderHistory() {
            const container = document.getElementById('diseaseHistory');
            const list = document.getElementById('diseaseHistoryList');
            if (!container || !list) return;
            if (this.history.length === 0) {
                container.style.display = 'none';
                return;
            }
            container.style.display = 'block';
            const recent = this.history.slice(-10).reverse();
            list.innerHTML = recent.map(h => `
                <div style="padding:3px 0;border-bottom:1px solid #f0f0f0;display:flex;justify-content:space-between;font-size:12px;">
                    <span>${h.disease}</span>
                    <span style="color:${h.diagCorrect ? '#27ae60' : '#e74c3c'};">${h.diagCorrect ? '✅' : '❌'}</span>
                    <span>治疗 ${h.txScore}%</span>
                    <span style="color:#888;">${h.time}</span>
                </div>
            `).join('');
        }

        updateDisplay(symptoms, hint) {
            const el = document.getElementById('diseaseSymptoms');
            const hintEl = document.getElementById('diseaseHint');
            if (el) el.textContent = symptoms || '🩺 没有更多题目';
            if (hintEl) hintEl.textContent = hint || '请根据症状判断疾病并给出治疗方案';
        }
    }

    // ============================================================
    // 导出插件实例
    // ============================================================

    const plugin = new DiseasePlugin();
    window.diseasePlugin = plugin;

    // 注册到插件系统
    window.registerDiseasePlugin = function() {
        const pluginInfo = {
            id: PLUGIN_ID,
            name: PLUGIN_NAME,
            version: PLUGIN_VERSION,
            description: '症状 → 诊断 → 治疗方案 完整训练',
            init: () => plugin.init(),
            destroy: () => { plugin.initialized = false; },
        };
        if (!window.plugins) window.plugins = {};
        window.plugins[PLUGIN_ID] = pluginInfo;
        console.log('✅ 插件 "' + PLUGIN_NAME + '" 已注册');
        return pluginInfo;
    };

    // 自动注册
    if (typeof window.registerPlugin === 'function') {
        window.registerPlugin(PLUGIN_ID, {
            name: PLUGIN_NAME,
            version: PLUGIN_VERSION,
            description: '症状 → 诊断 → 治疗方案 完整训练',
            init: () => plugin.init(),
        });
    } else {
        window.registerDiseasePlugin();
    }

    // 初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => plugin.init(), 200);
        });
    } else {
        setTimeout(() => plugin.init(), 200);
    }

    console.log('🔌 ' + PLUGIN_NAME + ' v' + PLUGIN_VERSION + ' 加载完成');

})();
