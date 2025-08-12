
        (function () {
            'use strict';

            /* ---------- Utilities ---------- */
            function sanitizeInputRaw(s) {
                if (s === null || s === undefined) return '';
                return String(s).trim().replace(/,/g, '').replace(/\s+/g, '');
            }
            function escapeHtml(s) { return String(s).replace(/[&<>"']/g, function (m) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]; }); }
            function isValidNumberString(s) {
                if (!s) return false;
                const t = sanitizeInputRaw(s);
                // allow scientific notation and common numeric formats
                const n = Number(t);
                return t.length > 0 && isFinite(n);
            }

            /* ---------- Significant figures counting (robust) ---------- */
            function countSigFigsFromString(raw) {
                if (raw === null || raw === undefined) return 0;
                let s = sanitizeInputRaw(raw);
                if (s === '') return 0;
                s = s.replace(/^[+-]/, '');

                const sciMatch = s.match(/^(.*?)[eE]([+-]?\d+)$/);
                if (sciMatch) {
                    const coeff = sciMatch[1];
                    return countSigFigsCoefficient(coeff);
                } else {
                    return countSigFigsCoefficient(s);
                }
            }

            function countSigFigsCoefficient(s) {
                if (!s) return 0;
                s = String(s).trim();
                if (/[^0-9.]/.test(s)) return 0;
                if (s.startsWith('.')) s = '0' + s;
                const hasDot = s.indexOf('.') !== -1;
                if (hasDot) {
                    const parts = s.split('.');
                    const intPart = parts[0];
                    const fracPart = parts[1] || '';
                    const intAllZeros = /^[0]*$/.test(intPart);
                    const fracAllZeros = fracPart === '' ? true : /^[0]*$/.test(fracPart);
                    if (intAllZeros && fracAllZeros) {
                        return fracPart.length;
                    }
                    const combined = intPart.replace(/^0+/, '') + fracPart;
                    if (combined.length === 0) return fracPart.length || 0;
                    return combined.length;
                } else {
                    const noLeading = s.replace(/^0+/, '');
                    if (noLeading.length === 0) return 1;
                    const strippedTrailing = noLeading.replace(/0+$/, '');
                    if (strippedTrailing.length === 0) return 1;
                    return strippedTrailing.length;
                }
            }

            /* ---------- Decimal places detection (for add/sub) ---------- */
            function decimalPlacesFromString(raw) {
                let s = sanitizeInputRaw(raw);
                if (!s) return null;
                s = s.replace(/^[+-]/, '');
                const sciMatch = s.match(/^(.*?)[eE]([+-]?\d+)$/);
                if (sciMatch) {
                    const coeff = sciMatch[1];
                    const exp = parseInt(sciMatch[2], 10);
                    const dotIndex = coeff.indexOf('.');
                    const after = dotIndex === -1 ? 0 : (coeff.length - dotIndex - 1);
                    const dp = after - exp;
                    return dp;
                } else {
                    if (s.indexOf('.') !== -1) return s.split('.')[1].length;
                    else return 0;
                }
            }

            /* ---------- Rounding helpers ---------- */
            function roundToNSignificantFigures(num, n) {
                if (!isFinite(num) || n < 1) return String(num);
                try {
                    return Number(num).toPrecision(n);
                } catch (e) {
                    return String(num);
                }
            }
            function roundToDecimalPlacesNumeric(value, dp) {
                if (!isFinite(value)) return value;
                if (dp === null || dp === undefined) return value;
                if (dp >= 0) return Number(value.toFixed(dp));
                const factor = Math.pow(10, -dp);
                return Math.round(value / factor) * factor;
            }
            function formatRoundedToDecimalPlaces(value, dp) {
                if (!isFinite(value)) return String(value);
                if (dp >= 0) return Number(value).toFixed(dp);
                return String(roundToDecimalPlacesNumeric(value, dp));
            }

            /* ---------- Expression evaluation (safe) ---------- */
            // We need a safe expression evaluator for the keypad = functionality.
            // Support: + - * / ^ parentheses, numbers including e notation, unary minus.
            // We'll implement a simple shunting-yard to RPN and evaluate.
            function tokenizeExpr(expr) {
                const s = String(expr).trim();
                const tokens = [];
                const re = /(\d+(\.\d+)?([eE][+-]?\d+)?|\.\d+|[+\-*/^()])/g;
                let m;
                while ((m = re.exec(s)) !== null) {
                    tokens.push(m[0]);
                }
                return tokens;
            }

            function shuntingYard(tokens) {
                const out = [];
                const ops = [];
                const prec = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3 };
                const rightAssoc = { '^': true };
                tokens.forEach((t, i) => {
                    if (/^(\d+(\.\d+)?([eE][+-]?\d+)?|\.\d+)$/.test(t)) {
                        out.push(t);
                    } else if (t === '+' || t === '-' || t === '*' || t === '/' || t === '^') {
                        while (ops.length) {
                            const o2 = ops[ops.length - 1];
                            if ((o2 in prec) && ((rightAssoc[t] && prec[t] < prec[o2]) || (!rightAssoc[t] && prec[t] <= prec[o2]))) {
                                out.push(ops.pop());
                            } else break;
                        }
                        ops.push(t);
                    } else if (t === '(') {
                        ops.push(t);
                    } else if (t === ')') {
                        while (ops.length && ops[ops.length - 1] !== '(') out.push(ops.pop());
                        if (ops.length && ops[ops.length - 1] === '(') ops.pop();
                        else throw new Error('Mismatched parentheses');
                    } else {
                        // ignore unknown
                    }
                });
                while (ops.length) {
                    const op = ops.pop();
                    if (op === '(' || op === ')') throw new Error('Mismatched parentheses');
                    out.push(op);
                }
                return out;
            }

            function evaluateRPN(rpn) {
                const stack = [];
                for (let tok of rpn) {
                    if (/^(\d+(\.\d+)?([eE][+-]?\d+)?|\.\d+)$/.test(tok)) {
                        stack.push(Number(tok));
                    } else {
                        if (tok === 'u-') { // unary minus (not used currently)
                            const a = stack.pop(); stack.push(-a);
                            continue;
                        }
                        const b = stack.pop();
                        const a = stack.pop();
                        if (tok === '+') stack.push(a + b);
                        else if (tok === '-') stack.push(a - b);
                        else if (tok === '*') stack.push(a * b);
                        else if (tok === '/') stack.push(a / b);
                        else if (tok === '^') stack.push(Math.pow(a, b));
                        else throw new Error('Unknown operator ' + tok);
                    }
                }
                if (stack.length !== 1) throw new Error('Invalid expression');
                return stack[0];
            }

            function evalExpression(expr) {
                // Accept only allowed characters
                const safe = String(expr).replace(/[^0-9eE+\-*/^().\s]/g, '');
                const tokens = tokenizeExpr(safe);
                if (tokens.length === 0) throw new Error('Empty expression');
                const rpn = shuntingYard(tokens);
                return evaluateRPN(rpn);
            }

            /* ---------- UI elements ---------- */
            const elDisplayInput = document.getElementById('displayInput');
            const elDisplaySig = document.getElementById('displaySig');
            const elSingleInput = document.getElementById('singleInput');
            const elRoundTo = document.getElementById('roundTo');
            const elBtnCount = document.getElementById('btnCount');
            const elBtnRound = document.getElementById('btnRound');
            const elBtnShowWork = document.getElementById('btnShowWork');
            const elBtnCopySingle = document.getElementById('btnCopySingle');
            const elBtnClear = document.getElementById('btnClear');
            const elKeypad = document.getElementById('keypad');
            const elSingleResult = document.getElementById('singleResult');
            const elSingleExplain = document.getElementById('singleExplain');

            const elNumA = document.getElementById('numA');
            const elNumB = document.getElementById('numB');
            const elOperation = document.getElementById('operation');
            const elBtnCompute = document.getElementById('btnCompute');
            const elTwoResult = document.getElementById('twoResult');
            const elTwoExplain = document.getElementById('twoExplain');
            const elBtnCopyTwo = document.getElementById('btnCopyTwo');
            const elHistoryList = document.getElementById('historyList');
            const elHistoryClear = document.getElementById('btnHistoryClear');

            const themeToggle = document.getElementById('themeToggle');
            const themeLabel = document.getElementById('themeLabel');
            const iconTheme = document.getElementById('iconTheme');

            // History storage
            let history = JSON.parse(localStorage.getItem('sigfig_history') || '[]');

            function saveHistoryItem(text) {
                history.unshift({ ts: Date.now(), text });
                history = history.slice(0, 40);
                localStorage.setItem('sigfig_history', JSON.stringify(history));
                renderHistory();
            }
            function clearHistory() {
                history = [];
                localStorage.setItem('sigfig_history', JSON.stringify(history));
                renderHistory();
            }
            function renderHistory() {
                if (!elHistoryList) return;
                if (history.length === 0) { elHistoryList.style.display = 'none'; elHistoryList.innerHTML = ''; return; }
                elHistoryList.style.display = 'block';
                elHistoryList.innerHTML = '<strong>History</strong><ul>' + history.map(h => {
                    const t = new Date(h.ts).toLocaleString();
                    return `<li><code>${escapeHtml(h.text)}</code> <small style="color:var(--muted)">— ${t}</small></li>`;
                }).join('') + '</ul>';
            }
            renderHistory();

            /* ---------- Display update helpers ---------- */
            function updateDisplayInput(text) {
                elDisplayInput.textContent = text || '0';
                // update sig fig count visually for the display value
                const count = countSigFigsFromString(text || '0');
                elDisplaySig.textContent = 'sig: ' + count;
            }

            // initialize display with example
            updateDisplayInput('0.004560');

            /* ---------- Keypad handling ---------- */
            let currentBuffer = ''; // expression buffer shown in input and display
            function appendToBuffer(str) {
                // smart handling for multiple e uses etc is deliberately simple: allow user freedom
                currentBuffer += String(str);
                elSingleInput.value = currentBuffer;
                updateDisplayInput(currentBuffer);
            }
            function setBuffer(str) {
                currentBuffer = String(str || '');
                elSingleInput.value = currentBuffer;
                updateDisplayInput(currentBuffer);
            }
            function backspaceBuffer() {
                currentBuffer = currentBuffer.slice(0, -1);
                elSingleInput.value = currentBuffer;
                updateDisplayInput(currentBuffer || '0');
            }
            function clearBuffer() {
                currentBuffer = '';
                elSingleInput.value = '';
                updateDisplayInput('0');
                hideSingleOutputs();
            }

            elKeypad.addEventListener('click', function (e) {
                const key = e.target.closest('.key');
                if (!key) return;
                const value = key.getAttribute('data-key');
                if (!value) return;
                if (value === 'CE') {
                    clearBuffer();
                    return;
                }
                if (value === 'DEL') {
                    backspaceBuffer();
                    return;
                }
                if (value === '±') {
                    // toggle sign of current numeric token (simple approach: if buffer empty add '-')
                    if (currentBuffer.startsWith('-')) setBuffer(currentBuffer.slice(1));
                    else setBuffer('-' + currentBuffer);
                    return;
                }
                if (value === '=') {
                    // Evaluate buffer expression, but also allow single numbers directly
                    try {
                        const expr = currentBuffer || elSingleInput.value;
                        if (!expr) return;
                        const result = evalExpression(expr);
                        // show in display as result (but preserve buffer)
                        updateDisplayInput(String(result));
                        setBuffer(String(result));
                        // also auto-run count
                        runCountOnInput(String(result));
                        saveHistoryItem(expr + ' = ' + result);
                    } catch (err) {
                        showSingle('Error evaluating expression: ' + err.message, '');
                    }
                    return;
                }
                // normal append
                appendToBuffer(value);
            });

            // allow typing in input
            elSingleInput.addEventListener('input', function () {
                currentBuffer = elSingleInput.value || '';
                updateDisplayInput(currentBuffer || '0');
            });

            // allow Enter to evaluate
            elSingleInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    try {
                        const result = evalExpression(elSingleInput.value || currentBuffer);
                        updateDisplayInput(String(result));
                        setBuffer(String(result));
                        runCountOnInput(String(result));
                        saveHistoryItem((elSingleInput.value || currentBuffer) + ' = ' + result);
                    } catch (err) {
                        showSingle('Error: ' + err.message, '');
                    }
                }
            });

            /* ---------- Show/hide single outputs ---------- */
            function showSingle(resultHtml, explanationHtml) {
                elSingleResult.innerHTML = resultHtml;
                elSingleResult.style.display = 'block';
                if (explanationHtml && explanationHtml.length > 0) {
                    elSingleExplain.innerHTML = explanationHtml;
                    elSingleExplain.style.display = 'block';
                } else {
                    elSingleExplain.style.display = 'none';
                }
            }
            function hideSingleOutputs() {
                elSingleResult.style.display = 'none';
                elSingleExplain.style.display = 'none';
            }

            /* ---------- Count action ---------- */
            function buildCountExplanation(raw) {
                const sRaw = sanitizeInputRaw(raw);
                if (!isValidNumberString(sRaw)) return 'Invalid input.';
                const signRemoved = sRaw.replace(/^[+-]/, '');
                const lines = [];
                lines.push('<strong>Input:</strong> ' + escapeHtml(raw));
                lines.push('<strong>Normalized:</strong> ' + escapeHtml(signRemoved));
                const sci = signRemoved.match(/^(.*?)[eE]([+-]?\d+)$/);
                if (sci) {
                    lines.push('Detected scientific notation.');
                    lines.push('Coefficient: <code>' + escapeHtml(sci[1]) + '</code>, Exponent: <code>' + escapeHtml(sci[2]) + '</code>.');
                    const coeffCount = countSigFigsCoefficient(sci[1]);
                    lines.push('Count significant figures in the coefficient only (ignore exponent).');
                    lines.push('<strong>Result:</strong> ' + coeffCount + ' significant figure(s).');
                    return lines.join('<br>');
                }
                if (signRemoved.indexOf('.') !== -1) {
                    lines.push('Number contains a decimal point.');
                    const p = signRemoved.split('.');
                    const intPart = p[0];
                    const fracPart = p[1] || '';
                    lines.push('Integer part: <code>' + escapeHtml(intPart) + '</code>, Fractional part: <code>' + escapeHtml(fracPart) + '</code>.');
                    const intAllZeros = /^[0]*$/.test(intPart);
                    const fracAllZeros = fracPart === '' ? true : /^[0]*$/.test(fracPart);
                    if (intAllZeros && fracAllZeros) {
                        lines.push('All digits are zeros. Convention: the number of sig figs equals digits after the decimal.');
                        lines.push('<strong>Result:</strong> ' + fracPart.length + ' significant figure(s).');
                        return lines.join('<br>');
                    } else {
                        const combined = intPart.replace(/^0+/, '') + fracPart;
                        lines.push('Remove leading zeros (placeholders). Count remaining digits (all are significant).');
                        lines.push('Digits counted: <code>' + escapeHtml(combined) + '</code> → <strong>' + combined.length + '</strong> significant figure(s).');
                        return lines.join('<br>');
                    }
                } else {
                    lines.push('Integer without a decimal point.');
                    const noLeading = signRemoved.replace(/^0+/, '');
                    if (noLeading.length === 0) {
                        lines.push('All digits are zeros (e.g., "0"). Convention: count as 1 sig fig.');
                        lines.push('<strong>Result:</strong> 1 significant figure.');
                        return lines.join('<br>');
                    }
                    const strippedTrailing = noLeading.replace(/0+$/, '');
                    if (strippedTrailing.length === 0) {
                        lines.push('Number has trailing zeros only (e.g., 1000). Without a decimal these trailing zeros are not considered significant.');
                        lines.push('If you intend them as significant, write a decimal (e.g., "1000.") or use scientific notation (e.g., "1.000e3").');
                        lines.push('<strong>Result:</strong> 1 significant figure (default convention).');
                        return lines.join('<br>');
                    } else {
                        lines.push('Remove leading zeros, then remove trailing zeros — trailing zeros in integers without a decimal are not counted.');
                        lines.push('Digits considered significant: <code>' + escapeHtml(strippedTrailing) + '</code> → <strong>' + strippedTrailing.length + '</strong> significant figure(s).');
                        return lines.join('<br>');
                    }
                }
            }

            function runCountOnInput(raw) {
                if (!raw) return;
                if (!isValidNumberString(raw)) { showSingle('Invalid number format.', ''); return; }
                const sig = countSigFigsFromString(raw);
                const explanation = buildCountExplanation(raw);
                showSingle('The number <strong>' + escapeHtml(raw) + '</strong> has <strong>' + sig + '</strong> significant figure(s).', explanation);
                saveHistoryItem('Count: ' + raw + ' → ' + sig + ' sig figs');
            }

            elBtnCount.addEventListener('click', function () {
                const val = elSingleInput.value || currentBuffer;
                runCountOnInput(val);
            });

            /* ---------- Round action ---------- */
            elBtnRound.addEventListener('click', function () {
                const val = elSingleInput.value || currentBuffer;
                const n = Number(elRoundTo.value);
                if (!val || !isValidNumberString(val)) { showSingle('Enter a valid number first.', ''); return; }
                if (!n || n < 1) { showSingle('Enter a valid number of significant figures (minimum 1).', ''); return; }
                const numeric = Number(sanitizeInputRaw(val));
                const roundedStr = roundToNSignificantFigures(numeric, n);
                const sigOrig = countSigFigsFromString(val);
                const explanation = 'Original: ' + escapeHtml(val) + ' (counts as ' + sigOrig + ' sig fig(s)).<br>Rounded to ' + n + ' significant figure(s): <strong>' + escapeHtml(roundedStr) + '</strong>.';
                showSingle('Rounded result: <strong>' + escapeHtml(roundedStr) + '</strong>', explanation);
                saveHistoryItem('Round: ' + val + ' → ' + roundedStr + ' (' + n + ' sig figs)');
            });

            /* ---------- Show work ---------- */
            elBtnShowWork.addEventListener('click', function () {
                const val = elSingleInput.value || currentBuffer;
                if (!val || !isValidNumberString(val)) { showSingle('Enter a valid number to show work.', ''); return; }
                const explanation = buildCountExplanation(val);
                showSingle('Show work for <strong>' + escapeHtml(val) + '</strong>', explanation);
            });

            /* ---------- Copy single result ---------- */
            elBtnCopySingle.addEventListener('click', function () {
                const text = (elSingleResult.innerText || elSingleResult.textContent || '').trim();
                if (!text) { alert('Nothing to copy.'); return; }
                navigator.clipboard?.writeText(text).then(() => { alert('Copied result to clipboard.'); }).catch(() => { alert('Copy failed.'); });
            });

            /* ---------- Clear ---------- */
            elBtnClear.addEventListener('click', function () {
                if (confirm('Clear input and outputs?')) {
                    clearBuffer();
                }
            });

            /* ---------- Arithmetic compute (add/sub mul/div) ---------- */
            function showTwo(resultHtml, explanationHtml) {
                elTwoResult.innerHTML = resultHtml;
                elTwoResult.style.display = 'block';
                if (explanationHtml && explanationHtml.length > 0) {
                    elTwoExplain.innerHTML = explanationHtml;
                    elTwoExplain.style.display = 'block';
                } else elTwoExplain.style.display = 'none';
            }

            elBtnCompute.addEventListener('click', function () {
                const A = elNumA.value;
                const B = elNumB.value;
                const op = elOperation.value;
                if (!isValidNumberString(A) || !isValidNumberString(B)) { showTwo('Enter two valid numbers.', ''); return; }
                const aNum = Number(sanitizeInputRaw(A));
                const bNum = Number(sanitizeInputRaw(B));
                let unrounded, finalStr, explanation = '';
                const sigA = countSigFigsFromString(A);
                const sigB = countSigFigsFromString(B);
                const dpA = decimalPlacesFromString(A);
                const dpB = decimalPlacesFromString(B);

                if (op === 'add' || op === 'sub') {
                    unrounded = (op === 'add') ? (aNum + bNum) : (aNum - bNum);
                    const minDp = Math.min(Number(dpA), Number(dpB));
                    const roundedStr = formatRoundedToDecimalPlaces(unrounded, minDp);
                    explanation += '<strong>Step-by-step</strong>:<br>';
                    explanation += 'A = ' + escapeHtml(A) + ' (decimal places: ' + dpA + '), B = ' + escapeHtml(B) + ' (decimal places: ' + dpB + ').<br>';
                    explanation += 'Unrounded result: ' + unrounded + '.<br>';
                    explanation += 'Least decimal places among operands = ' + minDp + '. Round unrounded result to ' + minDp + ' decimal place(s).<br>';
                    explanation += 'Final (rounded): <strong>' + escapeHtml(roundedStr) + '</strong>.';
                    finalStr = roundedStr + '  (unrounded: ' + unrounded + ')';
                    saveHistoryItem(A + ' ' + (op === 'add' ? '+' : '-') + ' ' + B + ' = ' + roundedStr);
                } else if (op === 'mul' || op === 'div') {
                    unrounded = (op === 'mul') ? (aNum * bNum) : (aNum / bNum);
                    const resultSig = Math.min(sigA, sigB);
                    const roundedStr = roundToNSignificantFigures(unrounded, resultSig);
                    explanation += '<strong>Step-by-step</strong>:<br>';
                    explanation += 'A = ' + escapeHtml(A) + ' (' + sigA + ' sig fig(s)), B = ' + escapeHtml(B) + ' (' + sigB + ' sig fig(s)).<br>';
                    explanation += 'Unrounded result: ' + unrounded + '.<br>';
                    explanation += 'Least sig figs among operands = ' + resultSig + '. Round result to ' + resultSig + ' significant figure(s).<br>';
                    explanation += 'Final (rounded): <strong>' + escapeHtml(roundedStr) + '</strong>.';
                    finalStr = roundedStr + '  (unrounded: ' + unrounded + ')';
                    saveHistoryItem(A + ' ' + (op === 'mul' ? '×' : '÷') + ' ' + B + ' = ' + roundedStr);
                } else {
                    showTwo('Invalid operation', '');
                    return;
                }
                showTwo(finalStr, explanation);
            });

            elBtnCopyTwo.addEventListener('click', function () {
                const text = (elTwoResult.innerText || elTwoResult.textContent || '').trim();
                if (!text) { alert('Nothing to copy.'); return; }
                navigator.clipboard?.writeText(text).then(() => { alert('Copied result.'); }).catch(() => { alert('Copy failed.'); });
            });

            elHistoryClear.addEventListener('click', function () {
                if (confirm('Clear calculation history?')) clearHistory();
            });

            /* ---------- Theme (dark/light) ---------- */
            function applyTheme(theme) {
                if (theme === 'dark') { document.body.classList.add('dark'); themeLabel.textContent = 'Dark'; themeToggle.setAttribute('aria-pressed', 'true'); }
                else { document.body.classList.remove('dark'); themeLabel.textContent = 'Light'; themeToggle.setAttribute('aria-pressed', 'false'); }
                localStorage.setItem('sigfig_theme', theme);
            }
            themeToggle.addEventListener('click', function () { const cur = document.body.classList.contains('dark') ? 'dark' : 'light'; applyTheme(cur === 'dark' ? 'light' : 'dark'); });
            themeToggle.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); themeToggle.click(); } });

            // init theme from localStorage or prefers-color-scheme
            const savedTheme = localStorage.getItem('sigfig_theme');
            if (savedTheme) applyTheme(savedTheme);
            else {
                const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme:dark)').matches;
                applyTheme(prefersDark ? 'dark' : 'light');
            }

            /* ---------- Small helpers & exposure ---------- */
            window.fillSingle = function (val, n) {
                setBuffer(val || '');
                if (n) elRoundTo.value = n;
            };
            window.fillTwo = function (a, b) { elNumA.value = a || ''; elNumB.value = b || ''; };
            document.getElementById('year').innerText = new Date().getFullYear();

            // expose some functions for debugging / extension
            window.__sigfig = window.__sigfig || {};
            window.__sigfig.count = countSigFigsFromString;
            window.__sigfig.round = roundToNSignificantFigures;
            window.__sigfig.decimalPlaces = decimalPlacesFromString;

            /* ---------- Self-test (console) - remove if desired ---------- */
            (function selfTest() {
                try {
                    const tests = { "0.004560": 4, "1234": 4, "0.00": 2, "0": 1, "100": 1, "100.": 3, "1.20e3": 3, "1.200E-2": 4, " .0050": 2, "405": 3, "1020": 3, "1000.": 4, "-0.0030": 2 };
                    console.group && console.group('SigFig Self-Test');
                    Object.keys(tests).forEach(k => {
                        const got = countSigFigsFromString(k);
                        const expect = tests[k];
                        if (got !== expect) console.warn('TEST FAIL', k, expect, got); else console.log('OK');
                    });
                    console.groupEnd && console.groupEnd();
                } catch (e) { console.error('Self-test error', e); }
            })();

            /* ---------- internal helpers used earlier (placed to avoid hoisting problems) ---------- */
            // These functions were referenced earlier; ensure they exist here:
            function setBuffer(str) { currentBuffer = String(str || ''); elSingleInput.value = currentBuffer; updateDisplayInput(currentBuffer || '0'); }
            // currentBuffer and clearBuffer/backspaceBuffer were defined previously in keypad section, but redeclare here if needed
            currentBuffer = elSingleInput.value || '';
            function clearBuffer() { currentBuffer = ''; elSingleInput.value = ''; updateDisplayInput('0'); hideSingleOutputs(); }
            function backspaceBuffer() { currentBuffer = currentBuffer.slice(0, -1); elSingleInput.value = currentBuffer; updateDisplayInput(currentBuffer || '0'); }

        })();
