/**
 * Pocket Money App - Bundled Script
 * Combined to allow running directly from file:// protocol without CORS errors.
 */

// ==========================================
// MODULE: STORAGE
// ==========================================
const Storage = {
    KEYS: {
        SETTINGS: 'pm_settings',
        STATE: 'pm_state',
        HISTORY: 'pm_history'
    },

    getSettings() {
        const data = localStorage.getItem(this.KEYS.SETTINGS);
        return data ? JSON.parse(data) : null;
    },

    saveSettings(settings) {
        localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(settings));
    },

    getState() {
        const data = localStorage.getItem(this.KEYS.STATE);
        return data ? JSON.parse(data) : null;
    },

    saveState(state) {
        localStorage.setItem(this.KEYS.STATE, JSON.stringify(state));
    },

    getHistory() {
        const data = localStorage.getItem(this.KEYS.HISTORY);
        return data ? JSON.parse(data) : [];
    },

    addToHistory(entry) {
        const history = this.getHistory();
        history.push(entry);
        localStorage.setItem(this.KEYS.HISTORY, JSON.stringify(history));
    }
};

// ==========================================
// MODULE: BUDGET
// ==========================================
const Budget = {
    recalculateDailyBudget() {
        const settings = Storage.getSettings();
        const state = Storage.getState();

        if (!settings || !state) return 0;

        const today = new Date();
        const currentDay = today.getDate();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

        // Calculate remaining days (including today)
        let remainingDays = 0;
        let weekendDays = 0;

        for (let d = currentDay; d <= daysInMonth; d++) {
            remainingDays++;
            const date = new Date(currentYear, currentMonth, d);
            const dayOfWeek = date.getDay();
            if (dayOfWeek === 0 || dayOfWeek === 6) { // 0=Sun, 6=Sat
                weekendDays++;
            }
        }

        const weekdayDays = remainingDays - weekendDays;
        const multiplier = settings.weekendMultiplier || 1;

        // Weighted sum of days
        const weightedTotalDays = weekdayDays + (weekendDays * multiplier);

        // Calculate Temporary Deductions
        let dailyDeduction = 0;
        if (state.temporaryDeductions) {
            const now = new Date().getTime();
            state.temporaryDeductions = state.temporaryDeductions.filter(d => d.endDate > now);
            state.temporaryDeductions.forEach(d => {
                dailyDeduction += d.dailyAmount;
            });
            Storage.saveState(state);
        }

        const availableBudget = state.totalRemaining - (state.savingsPot || 0);

        if (weightedTotalDays <= 0) return 0;

        const baseDailyBudget = availableBudget / weightedTotalDays;

        // Determine today's budget
        const todayDay = today.getDay();
        const isWeekend = todayDay === 0 || todayDay === 6;

        let todayBudget = isWeekend ? baseDailyBudget * multiplier : baseDailyBudget;

        todayBudget -= dailyDeduction;

        return Math.max(0, Math.floor(todayBudget * 100) / 100);
    },

    processEndOfDay(spent, action, diffAmount) {
        const state = Storage.getState();

        // 1. Deduct spending from total
        state.totalRemaining -= spent;

        // 2. Handle specific actions
        if (action === 'save') {
            state.savingsPot = (state.savingsPot || 0) + diffAmount;
        }

        // Log history
        const entry = {
            date: new Date().toISOString(),
            spent: spent,
            action: action,
            diff: diffAmount
        };

        // Initialize history if missing
        if (!state.dailyHistory) state.dailyHistory = [];
        state.dailyHistory.push(entry);

        Storage.saveState(state);
    },

    initializeMonth(totalBudget, weekendMultiplier) {
        const state = {
            totalRemaining: totalBudget,
            savingsPot: 0,
            lastUpdated: new Date().toISOString(),
            dailyHistory: [],
            temporaryDeductions: []
        };
        Storage.saveState(state);

        const settings = {
            monthlyAllowance: totalBudget,
            weekendMultiplier: weekendMultiplier,
            currency: '$'
        };
        Storage.saveSettings(settings);
    },

    getBudgetDetails() {
        const state = Storage.getState();
        const settings = Storage.getSettings();
        const dailyBudget = this.recalculateDailyBudget();

        return {
            dailyBudget: dailyBudget,
            totalRemaining: state.totalRemaining,
            savingsPot: state.savingsPot || 0,
            currency: settings.currency
        };
    }
};

// ==========================================
// MODULE: UI
// ==========================================
const UI = {
    appContainer: document.getElementById('app'),

    showView(viewName) {
        this.appContainer.innerHTML = '';

        switch (viewName) {
            case 'onboarding':
                this.renderOnboarding();
                break;
            case 'dashboard':
                this.renderDashboard();
                break;
            case 'history':
                this.renderHistory();
                break;
            default:
                this.appContainer.innerHTML = '<h2>Error: View not found</h2>';
        }
    },

    renderOnboarding() {
        const section = document.createElement('section');
        section.className = 'view active animate-fade-in';
        section.innerHTML = `
            <div class="glass-panel" style="text-align: center; margin-top: 10vh;">
                <h1>Welcome</h1>
                <p>Let's set up your pocket money for the month.</p>
                
                <form id="setup-form" style="margin-top: 2rem; text-align: left;">
                    <div class="form-group" style="margin-bottom: 1.5rem;">
                        <label style="display: block; margin-bottom: 0.5rem; color: var(--text-secondary);">Monthly Allowance</label>
                        <input type="number" id="monthly-allowance" placeholder="e.g. 1000" required 
                            style="width: 100%; padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--bg-secondary); background: var(--bg-secondary); color: white; font-size: 1.1rem;">
                    </div>

                    <div class="form-group" style="margin-bottom: 2rem;">
                        <label style="display: block; margin-bottom: 0.5rem; color: var(--text-secondary);">Weekend Spending</label>
                        <select id="weekend-multiplier" 
                            style="width: 100%; padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--bg-secondary); background: var(--bg-secondary); color: white; font-size: 1.1rem;">
                            <option value="1">Same as weekdays (1x)</option>
                            <option value="1.5" selected>A bit more (1.5x)</option>
                            <option value="2">Double budget (2x)</option>
                        </select>
                        <p style="font-size: 0.8rem; margin-top: 0.5rem; color: var(--text-muted);">We'll allocate more money for Saturdays and Sundays.</p>
                    </div>

                    <button type="submit" class="btn btn-primary">Start Budgeting</button>
                </form>
            </div>
        `;
        this.appContainer.appendChild(section);

        document.getElementById('setup-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const allowance = parseFloat(document.getElementById('monthly-allowance').value);
            const multiplier = parseFloat(document.getElementById('weekend-multiplier').value);

            if (allowance > 0) {
                Budget.initializeMonth(allowance, multiplier);
                this.showView('dashboard');
            }
        });
    },

    renderDashboard() {
        const data = Budget.getBudgetDetails();

        const section = document.createElement('section');
        section.className = 'view active animate-fade-in';
        section.innerHTML = `
            <div class="glass-panel" style="text-align: center; margin-bottom: 1.5rem;">
                <h3 style="color: var(--text-secondary); font-weight: 400;">Today's Budget</h3>
                <h1 style="font-size: 3.5rem; color: var(--accent-primary); margin: 0.5rem 0;">
                    ${data.currency}${data.dailyBudget.toFixed(2)}
                </h1>
                <p style="font-size: 0.9rem; color: var(--text-muted);">Spend wisely!</p>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 2rem;">
                <div class="glass-panel" style="padding: 1rem; text-align: center;">
                    <h4 style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Remaining</h4>
                    <h2 style="font-size: 1.5rem;">${data.currency}${data.totalRemaining.toFixed(2)}</h2>
                </div>
                <div class="glass-panel" style="padding: 1rem; text-align: center;">
                    <h4 style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 0.5rem;">Savings Pot</h4>
                    <h2 style="font-size: 1.5rem; color: var(--success);">${data.currency}${data.savingsPot.toFixed(2)}</h2>
                </div>
            </div>

            <div class="glass-panel" style="margin-bottom: 2rem;">
                <h3 style="font-size: 1.1rem; margin-bottom: 1rem;">Suggested for You</h3>
                <div id="activity-suggestion" style="display: flex; align-items: center; gap: 1rem;">
                    <div style="font-size: 2rem;">${this.getActivityIcon(data.dailyBudget)}</div>
                    <div>
                        <strong style="display: block; color: var(--text-primary);">${this.getActivityTitle(data.dailyBudget)}</strong>
                        <span style="font-size: 0.9rem; color: var(--text-secondary);">${this.getActivityDescription(data.dailyBudget)}</span>
                    </div>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <button id="history-btn" class="btn btn-secondary" style="padding: 1rem;">
                    View History
                </button>
                <button id="end-day-btn" class="btn btn-primary" style="padding: 1rem; font-size: 1.1rem;">
                    End Day
                </button>
            </div>
        `;
        this.appContainer.appendChild(section);

        document.getElementById('end-day-btn').addEventListener('click', () => {
            this.renderEndOfDayModal(data.dailyBudget);
        });

        document.getElementById('history-btn').addEventListener('click', () => {
            this.showView('history');
        });
    },

    getActivityIcon(budget) {
        if (budget > 50) return '🎬';
        if (budget > 20) return '☕';
        return '🌳';
    },

    getActivityTitle(budget) {
        if (budget > 50) return 'Treat Yourself!';
        if (budget > 20) return 'Nice Day Out';
        return 'Low Cost Fun';
    },

    getActivityDescription(budget) {
        if (budget > 50) return 'Cinema, fancy dinner, or a new game?';
        if (budget > 20) return 'Grab a coffee, visit a museum, or eat out.';
        return 'Read a book, go for a walk, or cook a nice meal.';
    },

    renderEndOfDayModal(dailyBudget) {
        const modal = document.createElement('div');
        modal.className = 'view active animate-fade-in';
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.background = 'rgba(15, 23, 42, 0.95)';
        modal.style.zIndex = '100';
        modal.style.display = 'flex';
        modal.style.justifyContent = 'center';
        modal.style.alignItems = 'center';

        modal.innerHTML = `
            <div class="glass-panel" style="width: 90%; max-width: 400px; position: relative;">
                <button id="close-modal" style="position: absolute; top: 10px; right: 10px; background: none; border: none; color: var(--text-muted); font-size: 1.5rem; cursor: pointer;">&times;</button>
                
                <div id="step-1">
                    <h2>End of Day</h2>
                    <p>How much did you spend today?</p>
                    <input type="number" id="spent-amount" placeholder="0.00" step="0.01" 
                        style="width: 100%; padding: 1rem; margin: 1.5rem 0; border-radius: var(--radius-sm); border: 1px solid var(--bg-secondary); background: var(--bg-secondary); color: white; font-size: 2rem; text-align: center;">
                    <button id="calc-diff-btn" class="btn btn-primary">Next</button>
                </div>

                <div id="step-2" class="hidden">
                    <!-- Dynamic content injected here -->
                </div>
            </div>
        `;

        this.appContainer.appendChild(modal);

        document.getElementById('close-modal').addEventListener('click', () => {
            modal.remove();
        });

        document.getElementById('calc-diff-btn').addEventListener('click', () => {
            const spent = parseFloat(document.getElementById('spent-amount').value) || 0;
            const diff = dailyBudget - spent;
            this.showResultOptions(diff, spent, modal);
        });
    },

    showResultOptions(diff, spent, modalContainer) {
        const step1 = modalContainer.querySelector('#step-1');
        const step2 = modalContainer.querySelector('#step-2');
        step1.classList.add('hidden');
        step2.classList.remove('hidden');

        if (diff >= 0) {
            // Under Budget (Savings)
            step2.innerHTML = `
                <h2 style="color: var(--success);">You saved $${diff.toFixed(2)}!</h2>
                <p>Great job! What should we do with it?</p>
                
                <div style="margin-top: 1.5rem; display: grid; gap: 1rem;">
                    <button class="btn btn-secondary" id="opt-spread">
                        <div style="text-align: left;">
                            <strong>Spread it</strong>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">Increase daily budget for rest of month</div>
                        </div>
                    </button>
                    <button class="btn btn-secondary" id="opt-save">
                        <div style="text-align: left;">
                            <strong>Piggy Bank</strong>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">Add to your savings pot</div>
                        </div>
                    </button>
                </div>
            `;

            step2.querySelector('#opt-spread').addEventListener('click', () => this.handleDecision('spread', diff, spent));
            step2.querySelector('#opt-save').addEventListener('click', () => this.handleDecision('save', diff, spent));

        } else {
            // Over Budget (Deficit)
            const deficit = Math.abs(diff);
            step2.innerHTML = `
                <h2 style="color: var(--danger);">Over by $${deficit.toFixed(2)}</h2>
                <p>Don't worry, we can adjust.</p>
                
                <div style="margin-top: 1.5rem; display: grid; gap: 1rem;">
                    <button class="btn btn-secondary" id="opt-week">
                        <div style="text-align: left;">
                            <strong>Fix this Week</strong>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">Heavier cuts, but back on track sooner</div>
                        </div>
                    </button>
                    <button class="btn btn-secondary" id="opt-month">
                        <div style="text-align: left;">
                            <strong>Spread Loss</strong>
                            <div style="font-size: 0.8rem; color: var(--text-muted);">Smaller cuts across remaining days</div>
                        </div>
                    </button>
                </div>
            `;

            step2.querySelector('#opt-week').addEventListener('click', () => this.handleDecision('week', deficit, spent));
            step2.querySelector('#opt-month').addEventListener('click', () => this.handleDecision('month', deficit, spent));
        }
    },

    handleDecision(action, amount, spent) {
        Budget.processEndOfDay(spent, action, amount);
        this.showView('dashboard');
    },

    renderHistory() {
        const state = Storage.getState();
        const history = state.dailyHistory || [];

        const section = document.createElement('section');
        section.className = 'view active animate-fade-in';
        section.innerHTML = `
            <div class="glass-panel" style="min-height: 80vh;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                    <h2>History</h2>
                    <button id="back-btn" class="btn btn-secondary" style="padding: 0.5rem 1rem;">Back</button>
                </div>
                
                <div class="history-list" style="display: flex; flex-direction: column; gap: 1rem;">
                    ${history.length === 0 ? '<p style="text-align: center; margin-top: 2rem;">No history yet.</p>' : ''}
                    ${history.slice().reverse().map(entry => `
                        <div style="background: rgba(255,255,255,0.05); padding: 1rem; border-radius: var(--radius-sm); display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <div style="font-weight: 600;">${new Date(entry.date).toLocaleDateString()}</div>
                                <div style="font-size: 0.8rem; color: var(--text-muted); text-transform: capitalize;">${entry.action}</div>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-weight: 600; color: var(--text-primary);">Spent: $${entry.spent.toFixed(2)}</div>
                                <div style="font-size: 0.8rem; color: ${entry.diff >= 0 ? 'var(--success)' : 'var(--danger)'};">
                                    ${entry.diff >= 0 ? 'Saved' : 'Over'}: $${Math.abs(entry.diff).toFixed(2)}
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        this.appContainer.appendChild(section);

        document.getElementById('back-btn').addEventListener('click', () => {
            this.showView('dashboard');
        });
    }
};

// ==========================================
// APP INITIALIZATION
// ==========================================
async function init() {
    // Simulate loading for effect
    await new Promise(resolve => setTimeout(resolve, 800));

    const userSettings = Storage.getSettings();

    if (!userSettings) {
        UI.showView('onboarding');
    } else {
        Budget.recalculateDailyBudget(); // Ensure numbers are fresh
        UI.showView('dashboard');
    }
}

document.addEventListener('DOMContentLoaded', init);
