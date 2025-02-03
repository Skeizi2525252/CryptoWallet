// Инициализация Telegram WebApp
const webapp = window.Telegram.WebApp;
webapp.ready();

// Конфигурация API и безопасности
const config = {
    apis: {
        coingecko: 'https://api.coingecko.com/api/v3',
        binance: 'https://api.binance.com/api/v3',
        exchangeRate: 'https://open.er-api.com/v6/latest/USD'
    },
    security: {
        encryptionKey: webapp.initData || 'fallback-key',
        maxRetries: 3,
        requestTimeout: 5000
    },
    updateInterval: 30000,
    chartPeriods: ['1H', '24H', '7D', '30D']
};

// Класс для работы с криптовалютами
class CryptoManager {
    constructor() {
        this.cryptoData = new Map();
        this.charts = new Map();
        this.currentCurrency = 'USD';
        this.exchangeRates = { USD: 1, RUB: 90 };
        this.retryCount = 0;
    }

    async initialize() {
        try {
            await this.loadCachedData();
            await this.fetchExchangeRates();
            await this.updateCryptoPrices();
            this.startUpdateCycle();
            this.initBackground();
        } catch (error) {
            console.error('Initialization error:', error);
            showMessage('Ошибка инициализации. Пожалуйста, перезагрузите приложение.');
        }
    }

    async loadCachedData() {
        const cached = localStorage.getItem('cryptoData');
        if (cached) {
            try {
                const decrypted = this.decrypt(cached);
                this.cryptoData = new Map(Object.entries(decrypted));
                this.updateUI();
            } catch (error) {
                console.error('Cache loading error:', error);
            }
        }
    }

    async fetchExchangeRates() {
        try {
            const response = await this.fetchWithTimeout(config.apis.exchangeRate);
            const data = await response.json();
            this.exchangeRates.RUB = data.rates.RUB;
        } catch (error) {
            console.error('Exchange rate error:', error);
        }
    }

    async updateCryptoPrices() {
        try {
            const [coingeckoData, binanceData] = await Promise.all([
                this.fetchCoinGeckoData(),
                this.fetchBinanceData()
            ]);

            this.updateCryptoDataFromAPIs(coingeckoData, binanceData);
            this.saveCryptoData();
            this.updateUI();
            this.retryCount = 0;
        } catch (error) {
            console.error('Price update error:', error);
            if (++this.retryCount < config.security.maxRetries) {
                setTimeout(() => this.updateCryptoPrices(), 1000);
            }
        }
    }

    async fetchCoinGeckoData() {
        const response = await this.fetchWithTimeout(
            `${config.apis.coingecko}/simple/price?ids=tether,tron,pepe,notcoin,trump-2024-token&vs_currencies=usd&include_24h_change=true&include_24h_vol=true&include_market_cap=true`
        );
        return response.json();
    }

    async fetchBinanceData() {
        const response = await this.fetchWithTimeout(
            `${config.apis.binance}/ticker/24hr?symbols=["USDTUSDT","TRXUSDT","PEPEUSDT"]`
        );
        return response.json();
    }

    updateCryptoDataFromAPIs(coingeckoData, binanceData) {
        for (const [symbol, data] of this.cryptoData) {
            const geckoId = this.getCoinGeckoId(symbol);
            const geckoPrice = coingeckoData[geckoId]?.usd;
            const binancePrice = this.getBinancePrice(symbol, binanceData);
            
            data.price = geckoPrice || binancePrice || data.price;
            data.change24h = coingeckoData[geckoId]?.usd_24h_change || 0;
            data.volume24h = coingeckoData[geckoId]?.usd_24h_vol || 0;
            data.marketCap = coingeckoData[geckoId]?.usd_market_cap || 0;
            data.lastUpdate = Date.now();
        }
    }

    async fetchChartData(symbol, period = '24H') {
        try {
            const geckoId = this.getCoinGeckoId(symbol);
            const days = this.periodToDays(period);
            const response = await this.fetchWithTimeout(
                `${config.apis.coingecko}/coins/${geckoId}/market_chart?vs_currency=usd&days=${days}`
            );
            const data = await response.json();
            return this.processChartData(data.prices, period);
        } catch (error) {
            console.error('Chart data error:', error);
            return null;
        }
    }

    processChartData(prices, period) {
        const interval = this.getChartInterval(period);
        return prices.filter((_, index) => index % interval === 0)
            .map(([timestamp, price]) => ({
                t: new Date(timestamp),
                y: price
            }));
    }

    createChart(symbol, data, canvas) {
        if (this.charts.has(symbol)) {
            this.charts.get(symbol).destroy();
        }

        const ctx = canvas.getContext('2d');
        const chart = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [{
                    label: `${symbol} Price`,
                    data: data,
                    borderColor: '#00f7ff',
                    borderWidth: 2,
                    fill: true,
                    backgroundColor: 'rgba(0, 247, 255, 0.1)',
                    tension: 0.4
                }]
            },
            options: this.getChartOptions()
        });

        this.charts.set(symbol, chart);
    }

    getChartOptions() {
        return {
            responsive: true,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'hour'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#8F8F8F'
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#8F8F8F'
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: '#00f7ff',
                    borderWidth: 1
                }
            }
        };
    }

    initBackground() {
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        const renderer = new THREE.WebGLRenderer({ alpha: true });
        
        renderer.setSize(window.innerWidth, window.innerHeight);
        document.getElementById('background-animation').appendChild(renderer.domElement);

        const geometry = new THREE.IcosahedronGeometry(1, 1);
        const material = new THREE.MeshPhongMaterial({
            color: 0x00f7ff,
            wireframe: true,
            transparent: true,
            opacity: 0.3
        });

        const crystal = new THREE.Mesh(geometry, material);
        scene.add(crystal);

        const light = new THREE.PointLight(0x00f7ff, 1, 100);
        light.position.set(10, 10, 10);
        scene.add(light);

        camera.position.z = 5;

        const animate = () => {
            requestAnimationFrame(animate);
            crystal.rotation.x += 0.001;
            crystal.rotation.y += 0.002;
            renderer.render(scene, camera);
        };

        animate();

        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    // Вспомогательные методы
    encrypt(data) {
        return CryptoJS.AES.encrypt(JSON.stringify(data), config.security.encryptionKey).toString();
    }

    decrypt(data) {
        const bytes = CryptoJS.AES.decrypt(data, config.security.encryptionKey);
        return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
    }

    async fetchWithTimeout(url, options = {}) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), config.security.requestTimeout);
        
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response;
        } finally {
            clearTimeout(timeout);
        }
    }

    startUpdateCycle() {
        setInterval(() => this.updateCryptoPrices(), config.updateInterval);
    }

    formatNumber(number, decimals = 2) {
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(number);
    }

    formatCurrency(amount, currency = this.currentCurrency) {
        const value = amount * this.exchangeRates[currency];
        const symbol = currency === 'USD' ? '$' : '₽';
        return `${symbol}${this.formatNumber(value)}`;
    }
}

// Инициализация приложения
const cryptoManager = new CryptoManager();
cryptoManager.initialize();

// Защита от отладки
const debugProtection = {
    init() {
        this.addDebuggerProtection();
        this.addConsoleProtection();
        this.addViewSourceProtection();
    },

    addDebuggerProtection() {
        setInterval(() => {
            const start = performance.now();
            debugger;
            const end = performance.now();
            if (end - start > 100) {
                window.location.href = "about:blank";
            }
        }, 1000);
    },

    addConsoleProtection() {
        const methods = ['log', 'debug', 'info', 'warn', 'error', 'table', 'trace'];
        methods.forEach(method => {
            console[method] = () => {
                throw new Error('Console is disabled');
            };
        });
    },

    addViewSourceProtection() {
        document.addEventListener('keydown', e => {
            if (e.ctrlKey && (e.keyCode === 85 || e.keyCode === 83 || e.keyCode === 73)) {
                e.preventDefault();
                return false;
            }
        });
    }
};

debugProtection.init(); 
