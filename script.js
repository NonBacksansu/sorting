class Passenger {
    constructor(row, seatLetter, baggageProb, baggageTime) {
        this.targetRow = row; 
        this.seatLetter = seatLetter;
        this.id = 'p' + Math.random().toString(36).substr(2, 9);
        this.hasLuggage = (Math.random() * 100) < baggageProb;
        this.luggageTicks = this.hasLuggage ? baggageTime : 0;
        this.currentAisleRow = -1; 
        this.isSeated = false;
        this.interferenceDelay = 0;
        this.state = 'moving'; 
    }

    calculateInterference(seatedMap) {
        let delay = 0;
        const rIdx = this.targetRow - 1;
        const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
        const sIdx = letters.indexOf(this.seatLetter);
        if (sIdx === 0) { if (seatedMap[rIdx][1]) delay += 2; if (seatedMap[rIdx][2]) delay += 2; }
        else if (sIdx === 1) { if (seatedMap[rIdx][2]) delay += 2; }
        else if (sIdx === 5) { if (seatedMap[rIdx][4]) delay += 2; if (seatedMap[rIdx][3]) delay += 2; }
        else if (sIdx === 4) { if (seatedMap[rIdx][3]) delay += 2; }
        return delay;
    }
}

class Simulator {
    constructor() {
        this.ROWS = 30;
        this.LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
        this.reset();
        this.init();
    }

    init() {
        this.buildGrid();
        this.attachEvents();
    }

    buildGrid() {
        const grid = document.getElementById('airplaneGrid');
        grid.innerHTML = '';
        
        // Loop through each column (Row 0 to 30)
        for (let col = 0; col <= this.ROWS; col++) {
            // 1. Label
            const lbl = document.createElement('div');
            lbl.className = 'cell row-label';
            lbl.innerText = col === 0 ? '' : col;
            grid.appendChild(lbl);

            // 2. Seats A B C
            for (let i = 0; i < 3; i++) {
                grid.appendChild(this.createCell(col, this.LETTERS[i]));
            }

            // 3. Aisle
            const aisle = document.createElement('div');
            aisle.className = 'cell aisle';
            if (col > 0) aisle.id = 'aisle-' + col;
            grid.appendChild(aisle);

            // 4. Seats D E F
            for (let i = 3; i < 6; i++) {
                grid.appendChild(this.createCell(col, this.LETTERS[i]));
            }
        }
    }

    createCell(col, letter) {
        const cell = document.createElement('div');
        if (col === 0) {
            cell.className = 'cell'; // Spacer column
        } else {
            cell.className = 'cell seat';
            cell.id = 'seat-' + col + '-' + letter;
        }
        return cell;
    }

    attachEvents() {
        document.getElementById('startBtn').addEventListener('click', () => this.runSimulation(false));
        document.getElementById('batchBtn').addEventListener('click', () => this.runBatch());
        document.getElementById('resetBtn').addEventListener('click', () => this.reset());
        ['baggageProb', 'baggageTime', 'simSpeed'].forEach(id => {
            const el = document.getElementById(id);
            el.addEventListener('input', () => {
                document.getElementById(id + 'Val').innerText = el.value + (id === 'baggageProb' ? '%' : '');
            });
        });
    }

    reset() {
        this.isRunning = false;
        this.ticks = 0;
        this.blockedTicks = 0;
        this.seatedCount = 0;
        this.passengers = [];
        this.seatedMap = Array.from({ length: 30 }, () => Array(6).fill(false));
        document.querySelectorAll('.seat').forEach(s => s.classList.remove('occupied'));
        document.querySelectorAll('.passenger-icon').forEach(p => p.remove());
        this.updateStats();
    }

    getGeneratedPassengers() {
        const strategy = document.getElementById('strategy').value;
        const bProb = parseInt(document.getElementById('baggageProb').value);
        const bTime = parseInt(document.getElementById('baggageTime').value);
        let list = [];
        for (let r = 1; r <= 30; r++) {
            for (let s = 0; s < 6; s++) { list.push(new Passenger(r, this.LETTERS[s], bProb, bTime)); }
        }
        if (strategy === 'random') list.sort(() => Math.random() - 0.5);
        else if (strategy === 'backToFront') list.sort((a, b) => b.targetRow - a.targetRow);
        else if (strategy === 'frontToBack') list.sort((a, b) => a.targetRow - b.targetRow);
        else if (strategy === 'windowToAisle') {
            const p = (l) => (l === 'A' || l === 'F') ? 0 : (l === 'B' || l === 'E') ? 1 : 2;
            list.sort((a, b) => p(a.seatLetter) - p(b.seatLetter) || b.targetRow - a.targetRow);
        } else if (strategy === 'steffen') {
            const groups = [{r:'even',s:['A','F']},{r:'odd',s:['A','F']},{r:'even',s:['B','E']},{r:'odd',s:['B','E']},{r:'even',s:['C','D']},{r:'odd',s:['C','D']}];
            let sList = [];
            groups.forEach(g => {
                let f = list.filter(p => (g.r === 'even' ? p.targetRow % 2 === 0 : p.targetRow % 2 !== 0) && g.s.includes(p.seatLetter));
                f.sort((a, b) => b.targetRow - a.targetRow);
                sList.push(...f);
            });
            list = sList;
        }
        return list;
    }

    async runSimulation(isBatch) {
        this.reset();
        this.passengers = this.getGeneratedPassengers();
        this.isRunning = true;
        return new Promise(resolve => {
            const step = () => {
                if (!this.isRunning) return resolve({ time: this.ticks, blocked: this.blockedTicks });
                this.tick();
                this.updateStats();
                if (this.seatedCount === 180) {
                    this.isRunning = false;
                    return resolve({ time: this.ticks, blocked: this.blockedTicks });
                }
                setTimeout(() => requestAnimationFrame(step), 1000 / parseInt(document.getElementById('simSpeed').value));
            };
            step();
        });
    }

    tick() {
        this.ticks++;
        const active = this.passengers.filter(p => p.currentAisleRow >= 0 && !p.isSeated);
        active.sort((a, b) => b.currentAisleRow - a.currentAisleRow);
        let blocked = false;

        active.forEach(p => {
            const icon = document.getElementById(p.id);
            if (p.state === 'storing' || p.state === 'interfering') {
                if (icon) icon.classList.add('is-storing');
                if (p.state === 'storing') {
                    p.luggageTicks--;
                    if (p.luggageTicks <= 0) {
                        p.interferenceDelay = p.calculateInterference(this.seatedMap);
                        p.state = p.interferenceDelay > 0 ? 'interfering' : 'seated';
                    }
                } else {
                    p.interferenceDelay--;
                    if (p.interferenceDelay <= 0) p.state = 'seated';
                }
            }

            if (p.state === 'seated' && !p.isSeated) {
                p.isSeated = true;
                this.seatedCount++;
                this.seatedMap[p.targetRow - 1][this.LETTERS.indexOf(p.seatLetter)] = true;
                const sEl = document.getElementById('seat-' + p.targetRow + '-' + p.seatLetter);
                if (sEl) sEl.classList.add('occupied');
                if (icon) icon.remove();
            }

            if (p.state === 'moving') {
                if (icon) icon.classList.remove('is-storing');
                if (p.currentAisleRow === p.targetRow) p.state = 'storing';
                else {
                    const next = p.currentAisleRow + 1;
                    if (!active.some(o => o.currentAisleRow === next)) {
                        p.currentAisleRow++;
                        this.updateIconPos(p);
                    } else { blocked = true; }
                }
            }
        });

        if (!active.some(p => p.currentAisleRow === 0)) {
            const next = this.passengers.find(p => p.currentAisleRow === -1);
            if (next) { next.currentAisleRow = 0; this.createIcon(next); }
        }
        if (blocked) this.blockedTicks++;
    }

    createIcon(p) {
        const icon = document.createElement('div');
        icon.className = 'passenger-icon';
        if (p.hasLuggage) icon.classList.add('has-luggage');
        icon.id = p.id;
        icon.innerText = p.seatLetter;
        document.body.appendChild(icon);
        this.updateIconPos(p);
    }

    updateIconPos(p) {
        const icon = document.getElementById(p.id);
        if (!icon) return;
        const aisle = document.getElementById('aisle-' + Math.max(1, p.currentAisleRow));
        if (!aisle) return;
        const rect = aisle.getBoundingClientRect();
        let left = rect.left + window.scrollX;
        if (p.currentAisleRow === 0) {
            left = document.getElementById('aisle-1').getBoundingClientRect().left + window.scrollX - 40;
        }
        icon.style.top = (rect.top + window.scrollY + 11) + 'px';
        icon.style.left = (left + 4) + 'px';
    }

    updateStats() {
        document.getElementById('statTime').innerText = this.ticks;
        document.getElementById('statSeated').innerText = this.seatedCount;
        document.getElementById('statBlocked').innerText = this.blockedTicks;
    }

    async runBatch() {
        const count = parseInt(document.getElementById('batchCount').value);
        const strategy = document.getElementById('strategy').value;
        const results = [];
        for (let i = 0; i < count; i++) results.push(await this.runSimulation(true));
        const avgT = results.reduce((a, b) => a + b.time, 0) / results.length;
        const avgB = results.reduce((a, b) => a + b.blocked, 0) / results.length;
        document.getElementById('resultsBody').insertRow(0).innerHTML = `<td>${strategy}</td><td>${count}</td><td>${avgT.toFixed(1)}</td><td>${avgB.toFixed(1)}</td>`;
    }
}

window.addEventListener('load', () => new Simulator());