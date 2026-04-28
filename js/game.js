// ===== 全局状态 =====
let gameState = {
  fragments: 0,
  totalFragments: 0,
  hp: 100,
  maxHp: 100,
  skillPoints: 0,
  level: 1,
  exp: 0,
  streak: 0,
  maxStreak: 0,
  lastCheckinDate: null,
  checkinHistory: [],
  checkinToday: {},
  completedBranches: [],
  branchProgress: {},
  unlockedSpecies: [],
  achievements: [],
  mistakes: [],
  totalAnswered: 0,
  totalCorrect: 0,
  currentCombo: 0,
  maxCombo: 0,
  carbonCalculated: false,
  beijingClaimed: {},
  dailyTasks: [],
  dailyTaskDate: null,
  dossierPhotos: [],
  defeatedBosses: [],
  bossDefeated: 0,
  inBossBattle: false,
  currentBranch: null,
  currentQuestionIndex: 0,
  answeredToday: 0,
  answeredDate: null,
  soundEnabled: true,
  guideShown: false,
  randomEvent: null,
  firstLogin: true,
  loginHistory: [],
  dailyStats: {}, // { '2026-04-23': { answered: 10, correct: 8 } }
  branchAccuracy: { general: { correct: 0, total: 0 }, pollution: { correct: 0, total: 0 }, ecology: { correct: 0, total: 0 }, lowcarbon: { correct: 0, total: 0 }, liability: { correct: 0, total: 0 } },
  questionTimes: [], // [{ duration, correct, difficulty, branch }]
  eventMultiplierExpire: null,
  gachaBoostExpire: null,
  hpProtectExpire: null,
  eventBonus: null, // { amount, claimed, trigger }
  mistakeReviewData: {}, // { mistakeId: { reviewCount, lastReviewDate, nextReviewDate, correctStreak } }
  hardCorrectStreak: 0,
  fullHpBossDefeat: 0,
  skillUsage: { guide: 0, shield: 0, rewind: 0, blessing: 0 },
  carbonCheckins: 0,
  reviewStreak: 0,
  lastReviewDate: null,
  redeemedMistakes: [],
  avatar: null,
  taskFloatPos: null,
  weakBranchFocus: null,
  shownStories: []
};

// 当前游戏会话状态
let sessionState = {
  shieldActive: false,
  currentQuestions: [],
  eventMultiplier: 1,
  usedSkillThisQuestion: false,
  questionStartTime: null
};

const SAVE_KEY = 'ecoLawGameData_v7';
const LETTERS = ['A', 'B', 'C', 'D'];
const BRANCH_NAME_MAP = { general: '总则', pollution: '污染防治', ecology: '生态保护', lowcarbon: '绿色低碳', liability: '生态责任' };
const CASE_CATEGORY_LABELS = { lowcarbon: '低碳', green: '绿色', watersave: '节水', energysave: '节能', other: '其他' };

// ===== 图片预加载 =====
function preloadImages(urls, onProgress) {
  let loaded = 0;
  const total = urls.length;
  if (total === 0) { if (onProgress) onProgress(1); return; }
  urls.forEach(url => {
    const img = new Image();
    img.onload = img.onerror = () => {
      loaded++;
      if (onProgress) onProgress(loaded / total);
    };
    img.src = url;
  });
}

// ===== 初始化 =====
function initApp() {
  // 主脚本已启动，清除加载超时保护
  if (window._loadGuard) {
    clearTimeout(window._loadGuard);
    window._loadGuard = null;
  }

  var bar = document.getElementById('loading-bar');
  var text = document.getElementById('loading-text');
  var loadingScreen = document.getElementById('loading-screen');
  var appContainer = document.getElementById('app-container');

  if (!bar || !text || !loadingScreen || !appContainer) {
    if (loadingScreen) loadingScreen.classList.add('hidden');
    if (appContainer) appContainer.classList.remove('hidden');
    if (typeof afterLoad === 'function') {
      try {
        afterLoad();
      } catch (e) {
        console.error('afterLoad 执行出错:', e);
      }
    }
    return;
  }

  var progress = 0;
  var finished = false;

  var loadInterval = setInterval(function() {
    progress += 10;
    if (progress > 100) progress = 100;
    bar.style.width = progress + '%';

    if (progress === 60) text.textContent = '加载法典条文库...';
    if (progress === 90) text.textContent = '预加载物种图鉴...';

    if (progress >= 100 && !finished) {
      finished = true;
      clearInterval(loadInterval);
      text.textContent = '准备就绪';
      setTimeout(function() {
        loadingScreen.style.opacity = '0';
        setTimeout(function() {
          loadingScreen.classList.add('hidden');
          appContainer.classList.remove('hidden');
          if (typeof afterLoad === 'function') {
            try {
              afterLoad();
            } catch (e) {
              console.error('afterLoad 执行出错:', e);
            }
          }
        }, 700);
      }, 300);
    }
  }, 200);

  generateDynamicBackground();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

function afterLoad() {
  loadGameProgress();
  checkDailyReset();
  checkOfflineReward();
  generateDailyTasks();
  checkRandomEvent();
  updateHeader();
  updateHomePage();
  renderChapterMapList();

  // 初始化音效开关视觉状态
  const soundToggle = document.getElementById('sound-toggle');
  const soundKnob = document.getElementById('sound-knob');
  if (soundToggle && soundKnob) {
    const enabled = gameState.soundEnabled;
    soundToggle.className = `w-12 h-6 rounded-full relative transition-colors ${enabled ? 'bg-eco-500' : 'bg-gray-300'}`;
    soundKnob.className = `w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all shadow-sm ${enabled ? 'left-6' : 'left-0.5'}`;
  }

  // 检查事件倍数是否过期
  checkEventEffects();
  // 如果有活跃事件，启动倒计时
  const hasActiveEvent = gameState.eventMultiplierExpire || gameState.gachaBoostExpire || gameState.hpProtectExpire;
  if (hasActiveEvent) startEventCountdown();

  loadAvatar();

  if (gameState.firstLogin && !gameState.guideShown) {
    gameState.firstLogin = false;
    saveGameProgress();
    storySystem.show('intro', () => {
      showGuide();
    });
  } else {
    // 回归剧情
    const lastLogin = gameState.loginHistory[gameState.loginHistory.length - 1];
    const hoursSince = lastLogin ? (Date.now() - lastLogin) / (1000 * 60 * 60) : 0;
    if (hoursSince > 6) {
      storySystem.show('comeback');
    }
  }

  // 记录登录
  gameState.loginHistory.push(Date.now());
  if (gameState.loginHistory.length > 30) gameState.loginHistory.shift();

  // 自动夜间模式
  const hour = new Date().getHours();
  if ((hour >= 22 || hour < 6) && !document.documentElement.classList.contains('dark')) {
    toggleDarkMode();
  }

  // 每天首次打开自动弹出打卡（今天还没打卡过）
  const todayStr = formatDate(new Date());
  if (gameState.lastCheckinDate !== todayStr && !gameState.firstLogin) {
    setTimeout(() => {
      showPage('page-checkin');
    }, 1500);
  }

  taskFloatSystem.init();
}

// ===== 动态背景 =====
function generateDynamicBackground() {
  const leavesContainer = document.getElementById('floating-leaves');
  const particlesContainer = document.getElementById('bg-particles');
  if (!leavesContainer || !particlesContainer) return;
  const colors = ['#22c55e', '#10b981', '#34d399', '#16a34a', '#059669'];

  for (let i = 0; i < 12; i++) {
    const leaf = document.createElement('div');
    leaf.className = 'leaf';
    leaf.style.left = Math.random() * 100 + '%';
    leaf.style.animationDuration = (8 + Math.random() * 12) + 's';
    leaf.style.animationDelay = Math.random() * 10 + 's';
    leaf.style.color = colors[Math.floor(Math.random() * colors.length)];
    leaf.style.width = (12 + Math.random() * 16) + 'px';
    leaf.style.height = leaf.style.width;
    leavesContainer.appendChild(leaf);
  }

  for (let i = 0; i < 20; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.top = Math.random() * 100 + '%';
    p.style.animationDuration = (3 + Math.random() * 5) + 's';
    p.style.animationDelay = Math.random() * 5 + 's';
    particlesContainer.appendChild(p);
  }
}

// ===== 存档管理 =====
function saveGameProgress() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(gameState));
  } catch (e) {
    console.warn('存档保存失败:', e);
  }
}

function deepMerge(target, source) {
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      target[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

function loadGameProgress() {
  try {
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      gameState = deepMerge(gameState, parsed);
    }
  } catch (e) {
    console.error('加载存档失败:', e);
  }
}

function resetGame() {
  if (!confirm('确定要清除所有游戏进度吗？此操作不可恢复。')) return;
  localStorage.removeItem(SAVE_KEY);
  location.reload();
}

// ===== 页面路由 =====
const navStack = [];
const FULLSCREEN_PAGES = ['page-quiz', 'page-boss', 'page-case-detail'];

function goBack() {
  const target = navStack.pop() || 'page-home';
  showPage(target, true);
}

// ===== 题目配图路径映射 =====
const QUESTION_IMAGE_MAP = {
  general: 'assets/photo/题目配图/第一编题目配图/第一编题目配图',
  pollution: 'assets/photo/题目配图/第二编题目配图/第二编题目配图',
  ecology: 'assets/photo/题目配图/第三编题目配图/第三编题目配图',
  lowcarbon: 'assets/photo/题目配图/第四编题目配图/第四编题目配图',
  liability: 'assets/photo/题目配图/第五编题目配图/第五编题目配图'
};

// ===== 生态漫画数据 =====
const COMICS_DATA = [
  {
    id: 'intro',
    name: '法典介绍',
    images: [
      'assets/photo/生态漫画配图/介绍生态法典部分/介绍生态环境法典部分 (1).png',
      'assets/photo/生态漫画配图/介绍生态法典部分/介绍生态环境法典部分 (2).png',
      'assets/photo/生态漫画配图/介绍生态法典部分/介绍生态环境法典部分 (3).png',
      'assets/photo/生态漫画配图/介绍生态法典部分/介绍生态环境法典部分 (4).png',
      'assets/photo/生态漫画配图/介绍生态法典部分/介绍生态环境法典部分 (5).png',
      'assets/photo/生态漫画配图/介绍生态法典部分/介绍生态环境法典部分 (6).png',
      'assets/photo/生态漫画配图/介绍生态法典部分/介绍生态环境法典部分 (7).png',
      'assets/photo/生态漫画配图/介绍生态法典部分/介绍生态环境法典部分 (8).png',
      'assets/photo/生态漫画配图/介绍生态法典部分/介绍生态环境法典部分 (9).png'
    ],
    captions: [
      '《中华人民共和国生态环境法典》是中国第二部法典，也是全球首部生态环境法典，于 2026 年 3 月 12 日通过，2026 年 8 月 15 日正式施行。',
      '《生态环境法典》的编纂进程清晰呈现：2023 年 11 月启动工作，2025 年完成草案首审、分编二审与三审稿合体，2026 年 3 月表决通过，同年 8 月 15 日正式施行。',
      '《中华人民共和国生态环境法典》替代 10 部单行环保法律，实现了分散环境法律规范的系统整合与协同效力，以 "系统整合、握指成拳" 为核心价值。',
      '《生态环境法典》共 1242 条，分为总则编、污染防治编、生态保护编、绿色低碳发展编、法律责任和附则编五编。',
      '《生态环境法典》第一编总则编，确立了 "保护生态环境、保障公众健康、建设美丽中国" 的立法目的，明确 "保护优先、预防为主、系统治理、严格责任" 基本原则，涵盖公众参与、生态补偿、突发事件应对等核心制度。',
      '《生态环境法典》第二编污染防治编，以 "守护蓝天碧水净土" 为目标，包含大气污染防治、水污染防治、土壤污染防治、固体废物管理及特殊污染防治等内容。',
      '《生态环境法典》第三编生态保护编，涵盖自然保护地建设、野生动植物物种保护、生态修复、自然资源保护，以及山水林田湖草沙一体化生态系统保护。',
      '《生态环境法典》第四编绿色低碳发展编（全球首创），包含能源转型、绿色交通、循环经济、碳排放管理与激励政策等绿色发展相关内容。',
      '《生态环境法典》第五编法律责任和附则编，针对超标排污、非法倾倒等违法行为，明确了行政处罚、刑事责任等法律责任，并规定了司法保障相关内容。'
    ]
  },
  {
    id: 'b1',
    name: '第一编',
    images: [
      'assets/photo/生态漫画配图/第一编/第一编 (1).jpg',
      'assets/photo/生态漫画配图/第一编/第一编 (2).jpg',
      'assets/photo/生态漫画配图/第一编/第一编 (3).jpg',
      'assets/photo/生态漫画配图/第一编/第一编 (4).jpg',
      'assets/photo/生态漫画配图/第一编/第一编 (5).jpg',
      'assets/photo/生态漫画配图/第一编/第一编 (6).jpg',
      'assets/photo/生态漫画配图/第一编/第一编 (7).jpg',
      'assets/photo/生态漫画配图/第一编/第一编 (8).jpg',
      'assets/photo/生态漫画配图/第一编/第一编 (9).jpg'
    ],
    captions: [
      '《生态环境法典》第一编第六条确立了七项生态环境保护原则，分别为预防为主、系统治理、生态优先、绿色发展、公众参与、社区环保、损害担责。',
      '《生态环境法典》第一编第十条要求公民增强生态环境保护意识，采取简约适度、绿色低碳的生活方式，自觉履行环保义务、遵守法律法规并配合环保措施。',
      '《生态环境法典》第十二条第四款规定，国家鼓励基层群众性自治组织、社会组织、生态环境保护志愿者等开展环保法律法规和知识宣传，营造良好生态风气。',
      '《生态环境法典》第一编第二十七条规定生态环境保护目标责任制和考核评价制度，考核结果向社会公开；第二十八条确立中央和省、自治区、直辖市两级生态环境保护督察体制。',
      '《生态环境法典》第五十二条规定，企业事业单位等违法造成或可能造成严重生态环境损害，或相关证据可能灭失、被隐匿的，监管部门可依法查封扣押其场所、船舶、设施、设备、工具、物品。',
      '《生态环境法典》第六十六条规定国家建立生态环境分区管控制度，地方政府按流程制定实施调整方案；第六十七条要求管控方案落实三线目标，划定三类管控单元并明确生态环境准入清单。',
      '《生态环境法典》第一编第七十八条要求生态环境监测机构、实行排污许可管理的单位等建立监测数据质量管理制度，相关主体及负责人对监测数据的真实性、准确性、完整性负责。',
      '《生态环境法典》第一编第一百四十七条第一款明确，国家鼓励社会组织、志愿者依法从事生态环境保护公益活动。',
      '《生态环境法典》第一编第一百六十二条第一款规定，建设项目中的污染防治设施应当与主体工程同时设计、同时施工、同时投产使用，不得擅自拆除或者闲置。'
    ]
  },
  {
    id: 'b2',
    name: '第二编',
    images: [
      'assets/photo/生态漫画配图/第二编/第二编(1).jpg',
      'assets/photo/生态漫画配图/第二编/第二编(2).jpg',
      'assets/photo/生态漫画配图/第二编/第二编(3).jpg',
      'assets/photo/生态漫画配图/第二编/第二编(4).jpg',
      'assets/photo/生态漫画配图/第二编/第二编(5).jpg',
      'assets/photo/生态漫画配图/第二编/第二编(6).jpg'
    ],
    captions: [
      '《生态环境法典》第二编污染防治第一分编通则第 149 条，确立 "精准治污、科学治污、依法治污" 方针，坚持统筹规划、源头防控等要求，实现减污降碳协同增效，首次将该方针写入法律并强调多污染物与区域协同治理。',
      '《环保法》第 164 条明确列举了暗管渗排、渗井 / 渗坑灌注、临时停产逃避检查、篡改监测数据等多种逃避监管的排污行为。',
      '《生态环境法典》第 416 条规定，未达到土壤污染风险管控、修复目标或未按规定完成相关调查评估的建设用地地块，禁止开工建设任何与风险管控、修复无关的项目。',
      '《固体废物污染防治法》第 466 条将减量化、资源化、无害化确立为固体废物管理的法律原则，要求对固体废物的产生、收集、贮存、运输、利用、处置全过程进行管控。',
      '《生态环境法典》第 499 条规定国家推行生活垃圾分类制度，坚持政府推动、全民参与、城乡统筹、因地制宜、简便易行的原则，将生活垃圾分为可回收物、厨余垃圾、有害垃圾、其他垃圾四类。',
      '《生态环境法典》第 544 条要求医疗卫生机构分类收集医疗废物并交由集中处置单位处置，处置单位需及时收运处置，同时双方要采取措施防止医疗废物流失、泄漏，还包含疫情期间医疗废物应急处置机制。'
    ]
  },
  {
    id: 'b3',
    name: '第三编',
    images: [
      'assets/photo/生态漫画配图/第三编/第三编 (1).png',
      'assets/photo/生态漫画配图/第三编/第三编 (2).png',
      'assets/photo/生态漫画配图/第三编/第三编 (3).png',
      'assets/photo/生态漫画配图/第三编/第三编 (4).png',
      'assets/photo/生态漫画配图/第三编/第三编 (5).png',
      'assets/photo/生态漫画配图/第三编/第三编 (6).png',
      'assets/photo/生态漫画配图/第三编/第三编 (7).png',
      'assets/photo/生态漫画配图/第三编/第三编 (8).png',
      'assets/photo/生态漫画配图/第三编/第三编 (9).png',
      'assets/photo/生态漫画配图/第三编/第三编 (10).png',
      'assets/photo/生态漫画配图/第三编/第三编 (11).png',
      'assets/photo/生态漫画配图/第三编/第三编 (12).png'
    ],
    captions: [
      '《中华人民共和国生态法典》第三编第一章一般规定，确立了生态保护优先、预防为主综合治理、公众参与等生态保护基本原则与通用制度。',
      '《中华人民共和国生态法典》第三编第二章生态系统保护，分森林、草原、湿地、海洋海岛、江河湖泊、荒漠六节对不同生态系统开展保护。',
      '《中华人民共和国生态法典》第三编第三章自然资源保护与可持续利用，对土地、矿产、水、渔业及其他自然资源的保护与利用进行规范。',
      '《中华人民共和国生态法典》第三编第四章物种保护，涵盖野生动物保护、野生植物保护及外来入侵物种防控的相关规定。',
      '《中华人民共和国生态法典》第三编第五章重要地理单元保护，针对自然保护地、长江流域、黄河流域、青藏高原等重点区域实施生态保护。',
      '《中华人民共和国生态法典》第三编第六章生态退化的预防和治理，重点规范水土保持与防沙治沙工作，并明确违反规定的法律责任。',
      '《中华人民共和国生态法典》第三编第七章生态修复，将生态修复定义为受损生态系统的恢复重建，明确了植树造林等修复措施与恢复生态功能的目标。',
      '《中华人民共和国生态法典》第三编的系统保护理念为 "山水林田湖草沙" 生命共同体，将高原、荒漠等自然生态系统纳入保护，转变单一生态要素保护思路。',
      '《中华人民共和国生态法典》第三编的科学绿化规定，要求城乡绿化因地制宜选择树种草，避免种植致敏植被和盲目引进外来物种。',
      '《中华人民共和国生态法典》第三编水土保持专节遵循预防为主、保护优先原则，包含水土保持空间管控、陡坡地开垦限制及生产建设项目水土保持方案要求。',
      '《中华人民共和国生态法典》第三编特定区域保护制度，针对黑土地、黄河流域、青藏高原、秦岭等重点区域，分别制定轮作休耕、水土保持、建立生态保护区、划定生态红线等差异化保护措施。',
      '《中华人民共和国生态法典》第三编针对 "人兽冲突" 问题增加引导解决规定，形成 "预防 + 补偿 + 修复" 的制度亮点，回应社会关切。'
    ]
  },
  {
    id: 'b4',
    name: '第四编',
    images: [
      'assets/photo/生态漫画配图/第四编/第四编 (1).jpg',
      'assets/photo/生态漫画配图/第四编/第四编 (2).jpg',
      'assets/photo/生态漫画配图/第四编/第四编 (3).jpg',
      'assets/photo/生态漫画配图/第四编/第四编 (4).jpg',
      'assets/photo/生态漫画配图/第四编/第四编 (5).jpg',
      'assets/photo/生态漫画配图/第四编/第四编 (6).jpg',
      'assets/photo/生态漫画配图/第四编/第四编 (7).jpg',
      'assets/photo/生态漫画配图/第四编/第四编 (8).jpg',
      'assets/photo/生态漫画配图/第四编/第四编 (9).jpg',
      'assets/photo/生态漫画配图/第四编/第四编 (10).jpg',
      'assets/photo/生态漫画配图/第四编/第四编 (11).jpg'
    ],
    captions: [
      '展示法典第四编中非化石能源开发利用制度，明确中长期发展目标、消纳保障机制与消费促进要求，推动风电、光伏等清洁能源规模化发展。',
      '体现法典第四编生产者责任延伸制度，要求电器电子、机动车、电池等产品生产者承担回收利用责任，完善废旧产品回收体系。',
      '对应法典第四编垃圾分类与资源化利用章节，提出建筑垃圾源头减量、生活垃圾分类投放、资源循环利用的全流程要求。',
      '展示法典第四编工业绿色循环发展的实践方向，鼓励余热回收、废水处理、余压发电等循环利用技术，提升资源利用效率。',
      '属于法典第四编可再生能源多元化开发内容，涵盖风电、光伏、地热、核电等清洁能源类型，推动能源结构绿色转型。',
      '展示法典第四编中非化石能源开发利用制度，明确中长期发展目标、消纳保障机制与消费促进要求，推动风电、光伏等清洁能源规模化发展。',
      '对应法典第四编灾害综合风险防控章节，规定极端天气气候事件的监测预警、评估与应急救援制度，筑牢公众安全防线。',
      '呈现法典第四编气候变化应对的重点领域，系统梳理生态、农业、基础设施、城市人居等方面的气候风险与治理方向。',
      '属于法典第四编塑料污染治理条款，明确禁止不可降解塑料袋、限制一次性用品生产销售，推广可降解替代产品。',
      '对应法典第四编绿色消费与绿色供应链制度，倡导公众践行绿色生活，推动企业建立环保供应链、抵制过度包装。',
      '对应法典第四编绿色消费与资源节约章节，以 "绿色消费 共护家园" 为主题，倡导减少浪费、循环利用，推广环保认证产品与可循环购物方式，引导公众践行低碳生活。'
    ]
  },
  {
    id: 'b5',
    name: '第五编',
    images: [
      'assets/photo/生态漫画配图/第五编/第五编 (1).jpg',
      'assets/photo/生态漫画配图/第五编/第五编 (2).jpg',
      'assets/photo/生态漫画配图/第五编/第五编 (3).jpg',
      'assets/photo/生态漫画配图/第五编/第五编 (4).jpg',
      'assets/photo/生态漫画配图/第五编/第五编 (5).jpg'
    ],
    captions: [
      '对应第五编追责时效制度，明确造成环境污染、生态破坏等危害后果的违法行为追责时效为 5 年，其他违法行为为 2 年，持续违法行为时效自终止之日起算。',
      '对应第五编责任顺位规则，规定责任人财产不足时，民事赔偿（对受害人的赔偿）优先于行政罚款、刑事罚金受偿。',
      '对应第五编无证排污处罚条款，对未取得排污许可排放污染物的企业，依法作出责令停业的行政处罚。',
      '对应第五编环境数据造假责任条款，明确篡改、伪造生态环境监测数据的行为将被处以 20 万元罚款，严打数据弄虚作假。',
      '体现生态法典编纂的体系化整合成果，原《环境保护法》《污染防治法》等多部单行生态环境法律完成使命，被整合纳入法典后 "光荣退休"。'
    ]
  }
];

// ===== 案例学习数据 =====
// CASES_DATA is now loaded from js/cases_data.js

function filterComics(tab) {
  document.querySelectorAll('.comic-tab').forEach(btn => {
    const active = btn.dataset.tab === tab;
    btn.className = active
      ? 'comic-tab px-3 py-1.5 rounded-full text-xs font-medium bg-eco-100 dark:bg-eco-900 text-eco-700 dark:text-eco-400 whitespace-nowrap transition-colors'
      : 'comic-tab px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 whitespace-nowrap transition-colors';
  });

  const group = COMICS_DATA.find(g => g.id === tab);
  const grid = document.getElementById('comics-grid');
  if (!grid || !group) return;

  const total = group.images.length;
  if (total === 0) {
    grid.innerHTML = '<p class="text-center text-sm text-gray-400 py-10">暂无图片</p>';
    return;
  }

  const is34 = group.id === 'intro' || group.id === 'b1';
  const aspectClass = is34 ? 'aspect-[3/4]' : '';
  const imgClass = is34
    ? 'w-full h-full max-h-[65vh] object-contain'
    : 'max-h-[55vh] max-w-full w-auto h-auto object-contain';

  const slides = group.images.map((src, i) => {
    const caption = (group.captions || [])[i] || '';
    return `
      <div class="snap-center shrink-0 w-[72vw] sm:w-[320px] select-none">
        <div class="rounded-xl overflow-hidden border border-eco-100 dark:border-gray-700 shadow-sm bg-gray-50 dark:bg-gray-900 cursor-pointer ${aspectClass} flex items-center justify-center" onclick="openImagePreview('${src}')">
          <img src="${src}" alt="${group.name} ${i+1}" class="${imgClass} mx-auto" loading="lazy" onerror="this.parentElement.style.display='none'">
        </div>
        <p class="mt-2.5 text-xs text-gray-600 dark:text-gray-400 leading-relaxed px-1">${caption}</p>
        <p class="text-[10px] text-gray-400 dark:text-gray-500 mt-1 text-center font-medium">${i+1} / ${total}</p>
      </div>
    `;
  }).join('');

  const dots = group.images.map((_, i) =>
    `<span class="w-1.5 h-1.5 rounded-full bg-eco-300 dark:bg-eco-800 transition-colors" data-dot="${i}"></span>`
  ).join('');

  grid.innerHTML = `
    <div class="relative">
      <div class="comic-carousel flex overflow-x-auto snap-x snap-mandatory scrollbar-hide gap-3 pb-2" data-series="${group.id}" onscroll="updateComicDots('${group.id}', this)">
        ${slides}
      </div>
      <button onclick="scrollComic('${group.id}', -1)" class="absolute left-0 top-[28%] -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 dark:bg-gray-800/80 shadow flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 transition-colors z-10">
        <i class="fas fa-chevron-left text-xs"></i>
      </button>
      <button onclick="scrollComic('${group.id}', 1)" class="absolute right-0 top-[28%] -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 dark:bg-gray-800/80 shadow flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 transition-colors z-10">
        <i class="fas fa-chevron-right text-xs"></i>
      </button>
    </div>
    <div class="flex justify-center gap-1.5 mt-2" id="comic-dots-${group.id}">${dots}</div>
  `;

  requestAnimationFrame(() => updateComicDots(group.id, document.querySelector(`.comic-carousel[data-series="${group.id}"]`)));
}

function scrollComic(seriesId, direction) {
  const carousel = document.querySelector(`.comic-carousel[data-series="${seriesId}"]`);
  if (!carousel) return;
  const child = carousel.children[0];
  const gap = 12;
  const step = child ? (child.offsetWidth + gap) : 300;
  carousel.scrollBy({ left: direction * step, behavior: 'smooth' });
}

function updateComicDots(seriesId, carousel) {
  if (!carousel) return;
  const dots = document.querySelectorAll(`#comic-dots-${seriesId} [data-dot]`);
  if (!dots.length) return;
  const child = carousel.children[0];
  if (!child) return;
  const gap = 12;
  const slideWidth = child.offsetWidth + gap;
  const index = Math.round(carousel.scrollLeft / slideWidth);
  dots.forEach((d, i) => {
    d.classList.toggle('bg-eco-600', i === index);
    d.classList.toggle('dark:bg-eco-400', i === index);
    d.classList.toggle('bg-eco-300', i !== index);
    d.classList.toggle('dark:bg-eco-800', i !== index);
  });
}

function filterCases(tab) {
  document.querySelectorAll('.case-tab').forEach(btn => {
    const active = btn.dataset.tab === tab;
    btn.className = active
      ? 'case-tab px-3 py-1.5 rounded-full text-xs font-medium bg-eco-100 dark:bg-eco-900 text-eco-700 dark:text-eco-400 whitespace-nowrap transition-colors'
      : 'case-tab px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 whitespace-nowrap transition-colors';
  });

  const items = tab === 'all' ? CASES_DATA : CASES_DATA.filter(c => c.category === tab);
  const grid = document.getElementById('cases-grid');
  if (!grid) return;

  grid.innerHTML = items.map(c => {
    const imgSection = c.img ? `
      <div class="h-40 sm:h-48 overflow-hidden bg-gray-100 dark:bg-gray-800">
        <img src="${c.img}" alt="${c.title}" class="w-full h-full object-cover" loading="lazy" onerror="this.parentElement.style.display='none'">
      </div>
    ` : `
      <div class="h-32 sm:h-40 bg-gradient-to-br from-eco-100 to-jade-100 dark:from-eco-900/40 dark:to-jade-900/40 flex items-center justify-center">
        <i class="fas fa-balance-scale text-4xl text-eco-400 dark:text-eco-600"></i>
      </div>
    `;
    const summarySection = c.summary ? `<p class="mt-1.5 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">${c.summary}</p>` : '';
    return `
      <div class="rounded-xl overflow-hidden border border-eco-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow cursor-pointer bg-white dark:bg-gray-800" onclick="openCaseDetail('${c.id}')">
        ${imgSection}
        <div class="p-3">
          <h4 class="text-sm font-medium text-gray-800 dark:text-white leading-snug">${c.title}</h4>
          ${summarySection}
        </div>
      </div>
    `;
  }).join('');
}

function openCaseDetail(caseId) {
  const c = CASES_DATA.find(x => x.id === caseId);
  if (!c) return;

  const titleEl = document.getElementById('case-detail-page-title');
  const categoryEl = document.getElementById('case-detail-page-category');
  const contentEl = document.getElementById('case-detail-page-content');
  const imgWrap = document.getElementById('case-detail-page-image-wrap');
  const img = document.getElementById('case-detail-page-image');

  const label = CASE_CATEGORY_LABELS[c.category] || c.category;
  if (titleEl) titleEl.textContent = c.title;
  if (categoryEl) categoryEl.textContent = label;

  if (contentEl) {
    if (c.detail) {
      // 将 detail 按段落分割渲染
      const lines = c.detail.split(/\r?\n/);
      const html = lines.map(line => {
        const t = line.trim();
        if (!t) return '';
        if (/^【.+】/.test(t)) {
          return '<p class="text-sm font-bold text-eco-700 dark:text-eco-400 mt-4 mb-1">' + t + '</p>';
        }
        return '<p class="text-[15px] text-gray-700 dark:text-gray-300 leading-relaxed text-justify mb-3">' + t + '</p>';
      }).join('');
      contentEl.innerHTML = html;
    } else {
      contentEl.innerHTML = '<p class="text-sm text-gray-400 text-center py-8">暂无详细文字内容</p>';
    }
  }

  if (imgWrap && img) {
    if (c.img) {
      img.src = c.img;
      imgWrap.classList.remove('hidden');
    } else {
      imgWrap.classList.add('hidden');
    }
  }

  showPage('page-case-detail');
}

function openImagePreview(src) {
  const modal = document.getElementById('image-preview-modal');
  const img = document.getElementById('preview-image');
  if (modal && img) {
    img.src = src;
    modal.classList.remove('hidden');
  }
}

function closeImagePreview() {
  const modal = document.getElementById('image-preview-modal');
  if (modal) modal.classList.add('hidden');
}

const PAGE_RENDERERS = {
  'page-pokedex': () => pokedexSystem.render(),
  'page-shop': () => shopSystem.render(),
  'page-achievements': () => achievementSystem.render(),
  'page-mistakes': () => mistakeSystem.render(),
  'page-checkin': () => checkinSystem.render(),
  'page-report': () => reportSystem.render(),
  'page-beijing': () => beijingSystem.render(),
  'page-map': () => renderChapterMapList(),
  'page-comics': () => filterComics('intro'),
  'page-cases': () => filterCases('all'),
};

function setNavActive(pageId) {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    const isActive = btn.dataset.page === pageId;
    btn.classList.toggle('text-gray-400', !isActive);
    btn.classList.toggle('dark:text-gray-600', !isActive);
    btn.classList.toggle('text-eco-600', isActive);
    btn.classList.toggle('dark:text-eco-400', isActive);
  });
}

function showPage(pageId, isBack) {
  if (isBack === undefined) isBack = false;
  const currentVisible = document.querySelector('.page:not(.hidden)');
  if (!isBack && currentVisible && currentVisible.id !== pageId) {
    navStack.push(currentVisible.id);
  }
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  const target = document.getElementById(pageId);
  if (target) target.classList.remove('hidden');

  setNavActive(pageId);

  const renderer = PAGE_RENDERERS[pageId];
  if (renderer) renderer();

  // 悬浮任务球仅在首页显示
  const floatBtn = document.getElementById('task-float-btn');
  if (floatBtn) {
    if (pageId === 'page-home') {
      floatBtn.classList.remove('hidden');
    } else {
      floatBtn.classList.add('hidden');
      taskFloatSystem.closePanel();
    }
  }

  // 答题、Boss战和案例详情页面隐藏底部导航
  const bottomNav = document.querySelector('nav.fixed.bottom-0');
  if (bottomNav) {
    if (FULLSCREEN_PAGES.includes(pageId)) {
      bottomNav.classList.add('hidden');
    } else {
      bottomNav.classList.remove('hidden');
    }
  }
}

// ===== Toast通知 =====
function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';

  const icons = {
    success: 'fa-check-circle text-eco-500',
    error: 'fa-times-circle text-red-500',
    warning: 'fa-exclamation-circle text-amber-500',
    info: 'fa-info-circle text-blue-500'
  };

  toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span class="text-sm font-medium">${msg}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// ===== 碎片操作 =====
function addFragments(amount, show) {
  if (show === undefined) show = true;
  checkEventEffects();
  const actual = Math.floor(amount * sessionState.eventMultiplier);
  gameState.fragments += actual;
  gameState.totalFragments += actual;
  updateHeader();
  if (show && actual > 0) {
    const multText = sessionState.eventMultiplier > 1 ? ` (x${sessionState.eventMultiplier} 活动加成)` : '';
    showToast(`获得 ${actual} 知识碎片${multText}`, 'success');
  }
}

function addExp(amount) {
  gameState.exp += amount;
  const needed = gameState.level * 10;
  if (gameState.exp >= needed) {
    gameState.exp -= needed;
    gameState.level++;
    gameState.maxHp += 10;
    gameState.hp = gameState.maxHp;
    addFragments(15, false);
    showToast(`升级！Lv.${gameState.level} ${getLevelTitle(gameState.level)} 生态指数上限+10`, 'success');
    updateHeader();
  }
}

function getLevelTitle(lv) {
  if (lv <= 5) return '新晋守护者';
  if (lv <= 10) return '见习法典使';
  if (lv <= 15) return '生态巡林人';
  if (lv <= 20) return '法典守护者';
  return '生态大贤者';
}

// ===== 新手指引系统（Spotlight 高亮）=====
const guideSystem = {
  steps: [
    { page: 'page-home', target: 'header', title: '你的身份', text: '这里显示你的等级、称号和知识碎片。坚持答题升级，解锁更高称号！', position: 'bottom' },
    { page: 'page-home', target: '#home-map-entry', title: '探索地图', text: '法典的五大编章等你逐一解锁。点击即可进入对应章节答题。', position: 'bottom' },
    { page: 'page-map', target: '.map-codex', title: '法典神殿', text: '五编环绕法典而设，每编都有独特的守护主题和节点特效。', position: 'right' },
    { page: 'page-pokedex', target: '#pokedex-grid', title: '物种图鉴', text: '收集珍稀物种，了解保护级别、栖息地和科学冷知识。', position: 'top' },
    { page: 'page-achievements', target: '#achievements-list', title: '荣誉殿堂', text: '完成挑战解锁多彩成就，见证你的成长之路！', position: 'top' }
  ],
  currentStep: 0,

  start() {
    this.currentStep = 0;
    this.showStep();
  },

  showStep() {
    if (this.currentStep >= this.steps.length) {
      this.end();
      return;
    }
    const step = this.steps[this.currentStep];
    if (step.page) showPage(step.page);

    setTimeout(() => {
      const target = document.querySelector(step.target);
      if (!target) { this.next(); return; }
      this.renderSpotlight(target, step);
    }, 350);
  },

  renderSpotlight(target, step) {
    this.clear();
    const rect = target.getBoundingClientRect();
    const pad = 8;
    const sL = rect.left - pad, sT = rect.top - pad;
    const sW = rect.width + pad * 2, sH = rect.height + pad * 2;

    const mask = document.createElement('div');
    mask.id = 'guide-mask';
    mask.style.cssText = 'position:fixed;inset:0;z-index:90;background:rgba(0,0,0,0.55);';
    mask.onclick = () => this.skip();

    const spot = document.createElement('div');
    spot.id = 'guide-spotlight';
    spot.style.cssText = `position:fixed;z-index:91;pointer-events:none;border-radius:14px;left:${sL}px;top:${sT}px;width:${sW}px;height:${sH}px;box-shadow:0 0 0 9999px rgba(0,0,0,0.55),inset 0 0 20px rgba(16,185,129,0.25),0 0 0 2px rgba(16,185,129,0.5);`;

    const isLast = this.currentStep === this.steps.length - 1;
    const tooltip = document.createElement('div');
    tooltip.id = 'guide-tooltip';
    tooltip.style.cssText = 'position:fixed;z-index:92;background:white;border-radius:16px;padding:14px;box-shadow:0 10px 40px rgba(0,0,0,0.2);border:1px solid #dcfce7;max-width:270px;min-width:190px;';
    tooltip.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <div style="width:22px;height:22px;border-radius:50%;background:#dcfce7;display:flex;align-items:center;justify-content:center;">
          <i class="fas fa-seedling" style="color:#16a34a;font-size:9px;"></i>
        </div>
        <h3 style="font-weight:bold;color:#15803d;font-size:13px;margin:0;">${step.title}</h3>
      </div>
      <p style="font-size:12px;color:#4b5563;line-height:1.6;margin:0 0 12px 0;">${step.text}</p>
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:10px;color:#9ca3af;">${this.currentStep + 1} / ${this.steps.length}</span>
        <div style="display:flex;gap:6px;">
          <button id="guide-skip" style="padding:4px 10px;font-size:10px;color:#6b7280;border:1px solid #d1d5db;border-radius:6px;background:white;cursor:pointer;">跳过</button>
          <button id="guide-next" style="padding:4px 10px;font-size:10px;color:white;background:#16a34a;border:none;border-radius:6px;cursor:pointer;box-shadow:0 2px 6px rgba(22,163,74,0.3);">${isLast ? '完成' : '下一步'}</button>
        </div>
      </div>`;

    const tp = this.calcTooltipPos(rect, step.position);
    tooltip.style.left = tp.left + 'px';
    tooltip.style.top = tp.top + 'px';

    document.body.appendChild(mask);
    document.body.appendChild(spot);
    document.body.appendChild(tooltip);

    document.getElementById('guide-next').onclick = (e) => { e.stopPropagation(); this.next(); };
    document.getElementById('guide-skip').onclick = (e) => { e.stopPropagation(); this.skip(); };
  },

  calcTooltipPos(rect, position) {
    const tw = 270, th = 130, gap = 14;
    let left, top;
    switch (position) {
      case 'top': left = rect.left + rect.width / 2 - tw / 2; top = rect.top - gap - th; break;
      case 'right': left = rect.right + gap; top = rect.top + rect.height / 2 - th / 2; break;
      case 'left': left = rect.left - gap - tw; top = rect.top + rect.height / 2 - th / 2; break;
      default: left = rect.left + rect.width / 2 - tw / 2; top = rect.bottom + gap;
    }
    left = Math.max(10, Math.min(left, window.innerWidth - tw - 10));
    top = Math.max(10, Math.min(top, window.innerHeight - th - 10));
    return { left, top };
  },

  next() { this.clear(); this.currentStep++; this.showStep(); },
  skip() { this.clear(); gameState.guideShown = true; saveGameProgress(); showToast('已跳过新手引导', 'info'); showPage('page-home'); },
  end() { this.clear(); gameState.guideShown = true; saveGameProgress(); showToast('新手引导完成！', 'success'); showPage('page-home'); },
  clear() {
    const gm = document.getElementById('guide-mask');
    if (gm) gm.remove();
    const gs = document.getElementById('guide-spotlight');
    if (gs) gs.remove();
    const gt = document.getElementById('guide-tooltip');
    if (gt) gt.remove();
  }
};

function showGuide() {
  if (gameState.guideShown) return;
  guideSystem.start();
}

// ===== 每日重置 =====
function checkDailyReset() {
  const today = formatDate(new Date());
  if (gameState.dailyTaskDate !== today) {
    gameState.dailyTaskDate = today;
    gameState.dailyTasks = [];
    gameState.checkinToday = {};
    gameState.answeredToday = 0;
    gameState.answeredDate = today;
    sessionState.eventMultiplier = 1;
    gameState.eventMultiplierExpire = null;
    gameState.gachaBoostExpire = null;
    gameState.hpProtectExpire = null;
    gameState.eventBonus = null;
    stopEventCountdown();
    generateDailyTasks();
  }
}

function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getSpeciesPlaceholder(name) {
  return `https://placehold.co/200x200/16a34a/ffffff?text=${encodeURIComponent(name)}`;
}

const RARITY_STYLES = {
  R: { label: 'R级', border: 'border-blue-400', badge: 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300', glow: 'gacha-glow-r' },
  SR: { label: 'SR级', border: 'border-purple-500', badge: 'bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-300', glow: 'gacha-glow-sr' },
  SSR: { label: 'SSR级', border: 'border-amber-500', badge: 'bg-amber-100 dark:bg-amber-900 text-amber-600 dark:text-amber-300', glow: 'gacha-glow-ssr' }
};

// ===== 离线收益 =====
function checkOfflineReward() {
  const lastLogin = gameState.loginHistory[gameState.loginHistory.length - 1];
  if (!lastLogin) return;
  const hoursOffline = (Date.now() - lastLogin) / (1000 * 60 * 60);
  // 限制离线收益计算：最多48小时，且至少间隔2小时才计算
  if (hoursOffline >= 2 && hoursOffline <= 48) {
    const reward = Math.min(Math.floor(hoursOffline * 2), 20);
    if (reward > 0) {
      gameState.fragments += reward;
      gameState.totalFragments += reward;
      showToast(`离线收益: 获得 ${reward} 碎片 (${Math.floor(hoursOffline)}小时)`, 'info');
    }
  }
}

// ===== 每日任务 =====
function generateDailyTasks() {
  if (gameState.dailyTasks.length > 0) return;

  const tasks = [];
  // 分析薄弱章节（最近有答题且正确率<70%的章节）
  const weakBranches = [];
  var branchAcc = gameState.branchAccuracy || {};
  Object.keys(branchAcc).forEach(function(key) {
    var val = branchAcc[key];
    if (val.total >= 3) {
      var rate = val.correct / val.total;
      if (rate < 0.7) weakBranches.push({ id: key, rate: rate, name: BRANCH_NAME_MAP[key] });
    }
  });
  weakBranches.sort(function(a, b) { return a.rate - b.rate; });

  // 自适应任务1：薄弱章节强化（如果有薄弱章节）
  if (weakBranches.length > 0) {
    const weak = weakBranches[0];
    tasks.push({
      id: 'weak_branch_' + weak.id,
      name: `薄弱章节：${weak.name}答对3道题`,
      desc: `在${weak.name}编累计答对3道题（当前正确率${Math.round(weak.rate * 100)}%）`,
      target: 3,
      type: 'answer_weak',
      reward: 15,
      weakBranch: weak.id
    });
  }

  // 自适应任务2：专家模式（已通关玩家）
  const allCompleted = gameState.completedBranches.length >= 5;
  if (allCompleted) {
    tasks.push({
      id: 'expert_hard',
      name: '专家模式：不用技能答对3道困难题',
      desc: '在答题过程中不使用任何技能，累计答对3道困难题',
      target: 3,
      type: 'expert_hard',
      reward: 20
    });
  }

  // 基础任务池（排除已添加的类型）
  const usedTypes = new Set(tasks.map(t => t.type));
  const pool = DAILY_TASK_TEMPLATES.filter(t => !usedTypes.has(t.type));
  const shuffled = [...pool].sort(() => Math.random() - 0.5);

  // 填充至3个任务
  while (tasks.length < 3 && shuffled.length > 0) {
    const t = shuffled.shift();
    tasks.push({ ...t, current: 0, completed: false, claimed: false });
  }

  gameState.dailyTasks = tasks.map(t => ({
    ...t,
    current: t.current || 0,
    completed: t.completed || false,
    claimed: t.claimed || false
  }));
}

function updateTaskProgress(type, amount) {
  if (amount === undefined) amount = 1;
  gameState.dailyTasks.forEach(task => {
    if (task.type === type && !task.completed) {
      task.current = Math.min(task.current + amount, task.target);
      if (task.current >= task.target) {
        task.completed = true;
        showToast(`任务完成: ${task.name}`, 'success');
        // 事件每日任务完成奖励
        if (gameState.eventBonus && gameState.eventBonus.trigger === 'daily_complete' && !gameState.eventBonus.claimed) {
          gameState.eventBonus.claimed = true;
          addFragments(gameState.eventBonus.amount);
          showToast(`事件奖励：完成使命额外获得${gameState.eventBonus.amount}碎片！`, 'success');
        }
      }
    }
  });
  renderDailyTasks();
  saveGameProgress();
}

function claimTaskReward(index) {
  const task = gameState.dailyTasks[index];
  if (!task.completed || task.claimed) return;
  task.claimed = true;
  addFragments(task.reward);
  renderDailyTasks();
  saveGameProgress();
}

function renderDailyTasks() {
  // 更新悬浮球徽章
  const badge = document.getElementById('task-float-badge');
  if (badge) {
    const incomplete = gameState.dailyTasks.filter(t => !t.completed).length;
    badge.textContent = incomplete;
    badge.style.display = incomplete > 0 ? 'flex' : 'none';
  }

  // 同时渲染到隐藏容器（供 taskFloatSystem 读取）
  const container = document.getElementById('daily-tasks-list');
  if (!container) return;
  container.innerHTML = gameState.dailyTasks.map((task, i) => {
    const pct = Math.min((task.current / task.target) * 100, 100);
    const statusClass = task.completed ? 'completed' : '';
    const btnHtml = task.completed && !task.claimed
      ? `<button onclick="claimTaskReward(${i})" class="text-xs bg-eco-500 text-white px-3 py-1 rounded-md hover:bg-eco-600 transition-colors">领取</button>`
      : task.claimed
        ? `<span class="text-xs text-gray-400">已领取</span>`
        : `<span class="text-xs text-gray-400">${task.current}/${task.target}</span>`;
    return `
      <div class="task-item ${statusClass}">
        <div class="task-check"><i class="fas fa-check"></i></div>
        <div class="flex-1">
          <p class="text-sm font-medium text-gray-800 dark:text-white">${task.name}</p>
          <p class="text-xs text-gray-500 dark:text-gray-400">${task.desc}</p>
          <div class="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mt-1.5 overflow-hidden">
            <div class="h-full bg-eco-500 rounded-full transition-all" style="width: ${pct}%"></div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-xs text-jade-600 dark:text-jade-400 font-medium">+${task.reward}</span>
          ${btnHtml}
        </div>
      </div>
    `;
  }).join('');
}

// ===== 每日任务悬浮球系统 =====
const taskFloatSystem = {
  isDragging: false,
  startX: 0, startY: 0,
  startLeft: 0, startTop: 0,
  hasMoved: false,

  init() {
    const btn = document.getElementById('task-float-btn');
    if (!btn) return;
    const saved = gameState.taskFloatPos;
    if (saved) {
      btn.style.right = 'auto'; btn.style.bottom = 'auto';
      btn.style.left = saved.left + 'px';
      btn.style.top = saved.top + 'px';
    }
    btn.addEventListener('touchstart', this.onStart.bind(this), { passive: false });
    btn.addEventListener('mousedown', this.onStart.bind(this));
    document.addEventListener('touchmove', this.onMove.bind(this), { passive: false });
    document.addEventListener('mousemove', this.onMove.bind(this));
    document.addEventListener('touchend', this.onEnd.bind(this));
    document.addEventListener('mouseup', this.onEnd.bind(this));
  },

  onStart(e) {
    const btn = document.getElementById('task-float-btn');
    this.isDragging = true; this.hasMoved = false;
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    this.startX = cx; this.startY = cy;
    const rect = btn.getBoundingClientRect();
    this.startLeft = rect.left; this.startTop = rect.top;
  },

  onMove(e) {
    if (!this.isDragging) return;
    e.preventDefault();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    const dx = cx - this.startX, dy = cy - this.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this.hasMoved = true;
    const btn = document.getElementById('task-float-btn');
    let nl = this.startLeft + dx, nt = this.startTop + dy;
    const maxW = window.innerWidth - btn.offsetWidth;
    const maxH = window.innerHeight - btn.offsetHeight;
    nl = Math.max(0, Math.min(nl, maxW));
    nt = Math.max(0, Math.min(nt, maxH));
    btn.style.right = 'auto'; btn.style.bottom = 'auto';
    btn.style.left = nl + 'px'; btn.style.top = nt + 'px';
  },

  onEnd() {
    if (!this.isDragging) return;
    this.isDragging = false;
    const btn = document.getElementById('task-float-btn');
    if (btn) {
      const rect = btn.getBoundingClientRect();
      gameState.taskFloatPos = { left: rect.left, top: rect.top };
      saveGameProgress();
    }
    if (!this.hasMoved) this.togglePanel();
  },

  togglePanel() {
    const panel = document.getElementById('task-float-panel');
    const btn = document.getElementById('task-float-btn');
    if (!panel || !btn) return;
    if (panel.classList.contains('hidden')) {
      this.renderList();
      const rect = btn.getBoundingClientRect();
      panel.classList.remove('hidden');
      let pl = rect.left + rect.width / 2 - 128;
      let pt = rect.top - panel.offsetHeight - 12;
      if (pt < 10) pt = rect.bottom + 12;
      if (pl < 10) pl = 10;
      if (pl + 256 > window.innerWidth - 10) pl = window.innerWidth - 266;
      panel.style.left = pl + 'px';
      panel.style.top = pt + 'px';
      setTimeout(() => document.addEventListener('click', this.onOutsideClick, { once: true }), 100);
    } else {
      this.closePanel();
    }
  },

  onOutsideClick(e) {
    const panel = document.getElementById('task-float-panel');
    const btn = document.getElementById('task-float-btn');
    if (panel && !panel.contains(e.target) && btn && !btn.contains(e.target)) {
      taskFloatSystem.closePanel();
    }
  },

  closePanel() {
    const panel = document.getElementById('task-float-panel');
    if (panel) panel.classList.add('hidden');
  },

  renderList() {
    const list = document.getElementById('task-float-list');
    if (!list) return;
    const tasks = gameState.dailyTasks || [];
    if (tasks.length === 0) {
      list.innerHTML = '<p class="text-xs text-gray-400 text-center py-2">今日暂无任务</p>';
      return;
    }
    list.innerHTML = tasks.map((t, i) => {
      const pct = Math.min((t.current / t.target) * 100, 100);
      const isCompleted = t.completed;
      const isClaimed = t.claimed;
      const rightHtml = isClaimed
        ? '<span class="text-[10px] text-gray-400 font-medium flex-shrink-0">已领取</span>'
        : isCompleted
          ? `<button onclick="claimTaskReward(${i}); taskFloatSystem.renderList();" class="text-[10px] bg-eco-500 text-white px-2 py-0.5 rounded font-medium flex-shrink-0">领取</button>`
          : `<span class="text-[10px] text-jade-600 dark:text-jade-400 font-medium flex-shrink-0">+${t.reward}</span>`;
      return `
        <div class="flex items-center gap-2 p-2 rounded-lg ${isClaimed ? 'bg-eco-50 dark:bg-eco-950/20' : 'bg-gray-50 dark:bg-gray-700/30'}">
          <div class="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${isCompleted ? 'bg-eco-500 text-white' : 'border-2 border-gray-300 dark:border-gray-600'}">
            ${isCompleted ? '<i class="fas fa-check text-[8px]"></i>' : ''}
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-xs ${isClaimed ? 'text-gray-400 line-through' : 'text-gray-700 dark:text-gray-300'} truncate">${t.name}</p>
            <div class="w-full h-1 bg-gray-200 dark:bg-gray-700 rounded-full mt-1 overflow-hidden">
              <div class="h-full bg-eco-500 rounded-full transition-all" style="width: ${pct}%"></div>
            </div>
          </div>
          ${rightHtml}
        </div>`;
    }).join('');
  }
};

// ===== 顶部状态更新 =====
function updateHeader() {
  const fragmentsDisplay = document.getElementById('fragments-display');
  const streakDisplay = document.getElementById('streak-display');
  const playerLevel = document.getElementById('player-level');
  const recoveryText = document.getElementById('global-recovery-text');
  const recoveryBar = document.getElementById('global-recovery-bar');

  if (fragmentsDisplay) fragmentsDisplay.textContent = gameState.fragments;
  if (streakDisplay) streakDisplay.textContent = gameState.streak;
  if (playerLevel) playerLevel.textContent = `Lv.${gameState.level} ${getLevelTitle(gameState.level)}`;

  // 全局恢复度
  const recovery = calculateGlobalRecovery();
  if (recoveryText) recoveryText.textContent = recovery.toFixed(1) + '%';
  if (recoveryBar) recoveryBar.style.width = recovery + '%';
}

function calculateGlobalRecovery() {
  let score = 0;
  score += Math.min(gameState.totalCorrect * 0.1, 20);
  score += gameState.completedBranches.length * 10;
  score += Math.min(gameState.unlockedSpecies.length * 1.5, 30);
  score += Math.min(gameState.achievements.length * 1, 15);
  score += Math.min(gameState.streak * 0.5, 10);
  score += Math.min(gameState.bossDefeated * 3, 15);
  return Math.min(score, 100);
}

// ===== 音效系统 =====
let audioCtx = null;
let eventCountdownInterval = null;
function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function playTone({ wave = 'sine', freqSteps = [], gainSteps = [], duration = 0.3 }) {
  if (!gameState.soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = wave;
    // 初始音量为0，避免默认gain=1导致爆破音
    gain.gain.setValueAtTime(0, now);
    freqSteps.forEach(([t, val, isExp]) => {
      if (isExp) osc.frequency.exponentialRampToValueAtTime(val, now + t);
      else osc.frequency.setValueAtTime(val, now + t);
    });
    gainSteps.forEach(([t, val, isExp]) => {
      if (isExp) gain.gain.exponentialRampToValueAtTime(val, now + t);
      else gain.gain.setValueAtTime(val, now + t);
    });
    osc.start(now);
    osc.stop(now + duration);
  } catch (e) {}
}

function playSound(type) {
  if (!gameState.soundEnabled) return;
  const now = 0;
  if (type === 'correct') {
    playTone({ wave: 'sine', freqSteps: [[now, 880]], gainSteps: [[now, 0.15], [0.15, 0.001, true]], duration: 0.15 });
  } else if (type === 'wrong') {
    playTone({ wave: 'square', freqSteps: [[now, 150]], gainSteps: [[now, 0.1], [0.2, 0.001, true]], duration: 0.2 });
  } else if (type === 'click') {
    playTone({ wave: 'sine', freqSteps: [[now, 800]], gainSteps: [[now, 0.05], [0.06, 0.001, true]], duration: 0.06 });
  } else if (type === 'gacha') {
    [0, 0.1, 0.2, 0.3].forEach((t, i) => {
      playTone({ wave: 'sine', freqSteps: [[t, 440 + i * 220]], gainSteps: [[t, 0.1], [t + 0.2, 0.001, true]], duration: t + 0.2 });
    });
  } else if (type === 'gacha_r') {
    playTone({ wave: 'sine', freqSteps: [[0, 523]], gainSteps: [[0, 0.08], [0.1, 0.001, true]], duration: 0.1 });
  } else if (type === 'gacha_sr') {
    playTone({ wave: 'sine', freqSteps: [[0, 659], [0.1, 880]], gainSteps: [[0, 0.1], [0.2, 0.001, true]], duration: 0.2 });
  } else if (type === 'boss') {
    playTone({ wave: 'square', freqSteps: [[now, 150], [0.4, 80, true]], gainSteps: [[now, 0.08], [0.5, 0.001, true]], duration: 0.5 });
  } else if (type === 'levelup') {
    [0, 0.1, 0.2, 0.3, 0.4].forEach((t, i) => {
      playTone({ wave: 'sine', freqSteps: [[t, 523 + i * 131]], gainSteps: [[t, 0.12], [t + 0.25, 0.001, true]], duration: t + 0.25 });
    });
  } else if (type === 'unlock') {
    playTone({ wave: 'sine', freqSteps: [[now, 880], [0.1, 1100]], gainSteps: [[now, 0.12], [0.4, 0.001, true]], duration: 0.4 });
  }
}

function startEventCountdown() {
  if (eventCountdownInterval) return;
  eventCountdownInterval = setInterval(updateEventCountdown, 1000);
}

function stopEventCountdown() {
  if (eventCountdownInterval) {
    clearInterval(eventCountdownInterval);
    eventCountdownInterval = null;
  }
}

// ===== 首页更新 =====
function updateHomePage() {
  renderDailyTasks();
  renderChapterMapList();
  checkAchievements();
}

// ===== 章节地图列表 =====
function renderChapterMapList() {
  // 更新首页入口进度文字
  const homeText = document.getElementById('home-map-text');
  if (homeText) {
    const completed = gameState.completedBranches.length;
    const total = BRANCHES.length;
    homeText.textContent = `${completed}/${total}`;
  }

  // ===== 渲染首页地图入口卡片 =====
  const homeEntry = document.getElementById('home-map-entry');
  if (homeEntry) {
    const completed = gameState.completedBranches.length;
    const total = BRANCHES.length;
    const currentBranch = BRANCHES.find((b, i) => {
      if (gameState.completedBranches.includes(b.id)) return false;
      return i === 0 || gameState.completedBranches.includes(BRANCHES[i - 1].id);
    });
    homeEntry.innerHTML = `
      <div class="flex-1 flex items-center justify-between bg-gradient-to-r from-eco-50 to-jade-50 dark:from-eco-900/20 dark:to-jade-900/20 rounded-xl p-3">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-eco-500 to-jade-600 flex items-center justify-center shadow-lg shadow-eco-500/20">
            <i class="fas fa-book-open text-white text-sm"></i>
          </div>
          <div>
            <p class="text-sm font-bold text-gray-800 dark:text-white">法典神殿</p>
            <p class="text-[10px] text-gray-500 dark:text-gray-400">已解锁 ${completed}/${total} 编${currentBranch ? ' · 当前：' + currentBranch.name : ''}</p>
          </div>
        </div>
        <div class="flex items-center gap-1.5 mr-1">
          ${BRANCHES.map((b, i) => {
            const isCompleted = gameState.completedBranches.includes(b.id);
            const isLocked = i > 0 && !gameState.completedBranches.includes(BRANCHES[i - 1].id);
            return `<div class="w-2 h-2 rounded-full ${isCompleted ? 'bg-eco-500' : isLocked ? 'bg-gray-300 dark:bg-gray-600' : 'bg-amber-400'}"></div>`;
          }).join('')}
        </div>
        <i class="fas fa-chevron-right text-gray-300 dark:text-gray-600 text-xs"></i>
      </div>
    `;
  }

  // ===== 渲染 page-map 法典地图 =====
  const container = document.getElementById('chapter-map-container');
  if (!container) return;

  const nodeStates = BRANCHES.map((b, i) => {
    const isCompleted = gameState.completedBranches.includes(b.id);
    const isLocked = i > 0 && !gameState.completedBranches.includes(BRANCHES[i - 1].id);
    return { isCompleted, isLocked, isCurrent: !isCompleted && !isLocked };
  });

  let lastActiveIndex = -1;
  nodeStates.forEach((s, i) => { if (!s.isLocked) lastActiveIndex = i; });

  // S 形节点位置
  const positions = [
    { x: 50, y: 10 },   // 总则 - 顶部中央
    { x: 20, y: 30 },   // 污染防治 - 左上
    { x: 80, y: 50 },   // 生态保护 - 右侧
    { x: 20, y: 70 },   // 绿色低碳 - 左下
    { x: 50, y: 90 }    // 生态责任 - 底部中央
  ];

  // S 形蜿蜒路径（连接相邻节点）
  const pathSegments = [
    'M160,52 Q112,104 64,156',
    'M64,156 Q20,208 256,260',
    'M256,260 Q280,312 64,364',
    'M64,364 Q20,416 160,468'
  ];

  // 路径亮到最后一个已解锁的节点
  const segVars = pathSegments.map((_, i) => `--seg-${i}:${i < lastActiveIndex ? 1 : 0};`).join('');

  container.className = 'map-canvas';
  container.style.cssText = segVars;

  container.innerHTML = `
    <div class="map-codex">
      <div class="map-codex-glow"></div>
      <div class="map-codex-book">
        <div class="map-codex-page map-codex-page-left"></div>
        <div class="map-codex-page map-codex-page-right"></div>
        <div class="map-codex-spine"></div>
      </div>
      <i class="fas fa-book-open map-codex-icon"></i>
    </div>

    <svg class="map-path-svg" viewBox="0 0 320 520" preserveAspectRatio="none">
      <defs>
        <linearGradient id="mapGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#10b981" />
          <stop offset="25%" stop-color="#3b82f6" />
          <stop offset="50%" stop-color="#10b981" />
          <stop offset="75%" stop-color="#f59e0b" />
          <stop offset="100%" stop-color="#ef4444" />
        </linearGradient>
      </defs>
      ${pathSegments.map(d => `<path class="map-path-bg" d="${d}" />`).join('')}
      ${pathSegments.map((d, i) => `<path class="map-path-active" d="${d}" style="opacity: var(--seg-${i}, 0)" />`).join('')}
    </svg>

    ${BRANCHES.map((b, i) => {
      const s = nodeStates[i];
      const pos = positions[i];
      const badge = s.isLocked
        ? `<div class="map-node-badge bg-gray-500 text-white"><i class="fas fa-lock"></i></div>`
        : s.isCompleted
        ? `<div class="map-node-badge bg-eco-500 text-white"><i class="fas fa-check"></i></div>`
        : '';
      return `
        <div class="map-node map-node-${b.id} ${s.isLocked ? 'locked' : ''} ${s.isCurrent ? 'current' : ''}"
             style="left:${pos.x}%;top:${pos.y}%;"
             onclick="${s.isLocked ? '' : `startBranch('${b.id}')`}">
          <div class="map-node-inner bg-gradient-to-br ${s.isLocked ? 'from-gray-400 to-gray-500' : b.color} shadow-lg">
            <i class="fas ${b.icon} ${s.isLocked ? 'text-gray-300' : 'text-white'} text-lg"></i>
            ${badge}
          </div>
          <div class="map-node-label">
            <p class="text-xs font-bold ${s.isLocked ? 'text-gray-400' : 'text-gray-800 dark:text-white'}">${b.name}</p>
            <p class="text-[10px] ${s.isLocked ? 'text-gray-400' : 'text-gray-500 dark:text-gray-400'}">
              ${s.isLocked ? '未解锁' : s.isCompleted ? '已完成' : b.theme}
            </p>
          </div>
        </div>
      `;
    }).join('')}
  `;
}

// ===== 章节地图详细 =====
function startBranch(branchId) {
  const branch = BRANCHES.find(b => b.id === branchId);
  if (!branch) return;

  // 检查是否解锁Boss
  const progress = gameState.branchProgress[branchId] || 0;
  if (progress >= branch.levels) {
    bossSystem.show(branchId);
    return;
  }

  // 解锁剧情
  if (STORY_DATA.branchUnlock[branchId] && progress === 0) {
    const story = STORY_DATA.branchUnlock[branchId];
    storySystem.currentStory = [story];
    storySystem.currentIndex = 0;
    storySystem.renderCurrent();
    storySystem.open();
  }

  // 初始化答题
  gameState.currentBranch = branchId;
  const branchQs = allQuestions.filter(q => q.branch === branchId);
  if (branchQs.length === 0) {
    showToast('该章节暂无题目，请稍后再试', 'warning');
    return;
  }
  // 记录已答题目的ID，避免重复
  gameState.answeredQuestionIds = gameState.answeredQuestionIds || {};
  const answeredIds = gameState.answeredQuestionIds[branchId] || [];
  // 过滤掉已答过的题目，如果全部答过则重置
  let remainingQs = branchQs.filter(q => !answeredIds.includes(q.id));
  if (remainingQs.length === 0) {
    remainingQs = branchQs;
    gameState.answeredQuestionIds[branchId] = [];
  }
  sessionState.currentQuestions = shuffleArray([...remainingQs]);
  gameState.currentQuestionIndex = 0;
  gameState.hp = gameState.maxHp;
  sessionState.shieldActive = false;
  // 记录本次答题的题数（用于新手保护期判断）
  sessionState.questionsInThisSession = 0;

  const quizBranchName = document.getElementById('quiz-branch-name');
  if (quizBranchName) quizBranchName.textContent = branch.name;
  showPage('page-quiz');
  renderQuestion();
}

function shuffleArray(arr) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ===== 答题系统 =====
const quizSystem = {
  answered: false,

  render() {
    renderQuestion();
  }
};

function renderQuestion() {
  const idx = gameState.currentQuestionIndex;
  const questions = sessionState.currentQuestions;
  if (!questions || questions.length === 0 || idx >= questions.length) {
    // 章节完成
    completeBranch(gameState.currentBranch);
    return;
  }

  const q = questions[idx];
  quizSystem.answered = false;
  sessionState.usedSkillThisQuestion = false;
  sessionState.questionStartTime = Date.now();

  const quizProgress = document.getElementById('quiz-progress');
  const questionType = document.getElementById('question-type');
  const questionDiff = document.getElementById('question-difficulty');
  const questionText = document.getElementById('question-text');
  const explanationPanel = document.getElementById('explanation-panel');
  const hpText = document.getElementById('hp-text');
  const hpBar = document.getElementById('hp-bar');
  const skillPoints = document.getElementById('skill-points');
  const optionsContainer = document.getElementById('question-options');

  if (quizProgress) quizProgress.textContent = `${idx + 1}/${questions.length}`;
  if (questionType) questionType.textContent = q.type === 'single' ? '单选题' : '多选题';
  if (questionDiff) {
    questionDiff.textContent = q.difficulty === 'easy' ? '基础' : q.difficulty === 'medium' ? '进阶' : '困难';
    questionDiff.className = `px-2 py-0.5 text-[10px] rounded-md difficulty-${q.difficulty}`;
  }
  const scenarioEl = document.getElementById('question-scenario');
  if (scenarioEl) {
    if (q.scenario) {
      scenarioEl.textContent = q.scenario;
      scenarioEl.classList.remove('hidden');
    } else {
      scenarioEl.classList.add('hidden');
    }
  }

  // 加载题目配图
  const imgContainer = document.getElementById('question-image-container');
  const imgEl = document.getElementById('question-image');
  if (imgContainer && imgEl) {
    const base = QUESTION_IMAGE_MAP[q.branch];
    if (base) {
      imgEl.src = `${base} (${q.id}).png`;
      imgContainer.classList.remove('hidden');
    } else {
      imgContainer.classList.add('hidden');
    }
  }

  if (questionText) questionText.textContent = q.question;
  if (explanationPanel) explanationPanel.classList.add('hidden');
  if (hpText) hpText.textContent = `${gameState.hp}/${gameState.maxHp}`;
  if (hpBar) hpBar.style.width = `${(gameState.hp / gameState.maxHp) * 100}%`;
  if (skillPoints) skillPoints.textContent = gameState.skillPoints;

  if (optionsContainer) {
    optionsContainer.innerHTML = q.options.map((opt, i) => `
      <button class="quiz-option w-full text-left" onclick="handleAnswer(${i})" data-index="${i}">
        <span class="quiz-option-letter">${LETTERS[i]}</span>
        <span class="text-xs text-gray-700 dark:text-gray-300">${opt}</span>
      </button>
    `).join('');
  }
}

function handleAnswer(index) {
  if (quizSystem.answered) return;
  quizSystem.answered = true;
  sessionState.questionsInThisSession++;

  const q = sessionState.currentQuestions[gameState.currentQuestionIndex];
  const options = document.querySelectorAll('.quiz-option');
  options.forEach(opt => opt.classList.add('disabled'));

  // 记录答题时长
  const duration = sessionState.questionStartTime ? (Date.now() - sessionState.questionStartTime) / 1000 : 0;
  gameState.questionTimes.push({ duration, correct: index === q.correct, difficulty: q.difficulty, branch: q.branch });
  // 保留最近200条记录防止无限增长
  if (gameState.questionTimes.length > 200) gameState.questionTimes = gameState.questionTimes.slice(-200);

  const isCorrect = index === q.correct;

  if (isCorrect) {
    options[index].classList.add('correct');
    handleCorrect(q);
  } else {
    options[index].classList.add('wrong');
    options[q.correct].classList.add('correct');
    handleWrong(q);
  }

  // 记录统计
  const today = formatDate(new Date());
  if (!gameState.dailyStats[today]) gameState.dailyStats[today] = { answered: 0, correct: 0 };
  gameState.dailyStats[today].answered++;
  gameState.branchAccuracy[q.branch].total++;
  if (isCorrect) {
    gameState.dailyStats[today].correct++;
    gameState.branchAccuracy[q.branch].correct++;
  }
  // 清理超过90天的旧统计
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffStr = formatDate(cutoff);
  Object.keys(gameState.dailyStats).forEach(ds => {
    if (ds < cutoffStr) delete gameState.dailyStats[ds];
  });

  // 记录已答题目ID
  gameState.answeredQuestionIds = gameState.answeredQuestionIds || {};
  gameState.answeredQuestionIds[gameState.currentBranch] = gameState.answeredQuestionIds[gameState.currentBranch] || [];
  if (!gameState.answeredQuestionIds[gameState.currentBranch].includes(q.id)) {
    gameState.answeredQuestionIds[gameState.currentBranch].push(q.id);
  }

  // HP归零时不显示解析面板
  if (gameState.hp <= 0) {
    return;
  }

  // 显示解析（优化延迟，从600ms减至400ms）
  setTimeout(() => {
    showExplanation(q, isCorrect);
  }, 400);
}

function handleCorrect(q) {
  playSound('correct');
  gameState.totalCorrect++;
  gameState.totalAnswered++;
  gameState.currentCombo++;
  if (gameState.currentCombo > gameState.maxCombo) gameState.maxCombo = gameState.currentCombo;

  // hard题连击追踪
  if (q.difficulty === 'hard') {
    gameState.hardCorrectStreak = (gameState.hardCorrectStreak || 0) + 1;
  } else {
    gameState.hardCorrectStreak = 0;
  }

  // 错题 redemption：曾经做错的题再次答对
  const wasMistake = gameState.mistakes.find(m => m.id === q.id);
  if (wasMistake) {
    gameState.redeemedMistakes = gameState.redeemedMistakes || [];
    if (!gameState.redeemedMistakes.includes(q.id)) {
      gameState.redeemedMistakes.push(q.id);
    }
    // 更新错题复习数据
    const reviewData = gameState.mistakeReviewData || {};
    const rd = reviewData[q.id] || { reviewCount: 0, correctStreak: 0 };
    rd.correctStreak = (rd.correctStreak || 0) + 1;
    rd.lastReviewDate = formatDate(new Date());
    // 连续2次正确自动标记掌握
    if (rd.correctStreak >= 2) {
      wasMistake.mastered = true;
      showToast('间隔重复成功！该错题已自动标记掌握', 'success');
    }
    reviewData[q.id] = rd;
    gameState.mistakeReviewData = reviewData;
  }

  // 自适应任务：薄弱章节答题进度
  gameState.dailyTasks.forEach(task => {
    if (task.type === 'answer_weak' && task.weakBranch === q.branch && !task.completed) {
      task.current = Math.min(task.current + 1, task.target);
      if (task.current >= task.target) {
        task.completed = true;
        showToast(`任务完成: ${task.name}`, 'success');
      }
    }
    if (task.type === 'expert_hard' && q.difficulty === 'hard' && !sessionState.usedSkillThisQuestion && !task.completed) {
      task.current = Math.min(task.current + 1, task.target);
      if (task.current >= task.target) {
        task.completed = true;
        showToast(`任务完成: ${task.name}`, 'success');
      }
    }
  });

  const baseReward = 2;
  const comboBonus = Math.min(Math.floor(gameState.currentCombo / 5), 3);
  const totalReward = baseReward + comboBonus;
  addFragments(totalReward);

  // 事件首次答题奖励
  if (gameState.eventBonus && gameState.eventBonus.trigger === 'first_answer' && !gameState.eventBonus.claimed) {
    gameState.eventBonus.claimed = true;
    addFragments(gameState.eventBonus.amount);
    showToast(`事件奖励：首次答题额外获得${gameState.eventBonus.amount}碎片！`, 'success');
  }

  // 技能点
  gameState.skillPoints += 1;

  // 经验值
  const expGain = 1 + Math.min(Math.floor(gameState.currentCombo / 5), 2);
  addExp(expGain);

  // 连击显示
  if (gameState.currentCombo >= 3) {
    const comboEl = document.getElementById('combo-display');
    const comboCount = document.getElementById('combo-count');
    if (comboCount) comboCount.textContent = gameState.currentCombo;
    if (comboEl) {
      comboEl.classList.remove('hidden');
      setTimeout(() => { if (comboEl) comboEl.classList.add('hidden'); }, 1500);
    }
  }

  // 首次正确剧情
  if (gameState.totalCorrect === 1) {
    setTimeout(() => storySystem.show('firstCorrect'), 2000);
  }

  updateTaskProgress('answer');
  updateTaskProgress('combo', gameState.currentCombo);

  showToast(`正确！+${totalReward}碎片 ${gameState.currentCombo >= 3 ? `(连击x${gameState.currentCombo})` : ''}`, 'success');
  checkAchievements();
}

function handleWrong(q) {
  playSound('wrong');
  gameState.totalAnswered++;
  gameState.currentCombo = 0;
  gameState.hardCorrectStreak = 0;

  // 新手保护期：本次答题前3题错误不扣血
  const isProtected = sessionState.questionsInThisSession <= 3 && gameState.totalAnswered <= 10;

  if (sessionState.shieldActive) {
    sessionState.shieldActive = false;
    showToast('护盾抵挡了伤害！', 'info');
  } else if (isProtected) {
    showToast('新手保护：本次答题不扣血', 'info');
  } else {
    const protect = gameState.hpProtectExpire && Date.now() < gameState.hpProtectExpire;
    gameState.hp -= protect ? 8 : 15;
    if (gameState.hp < 0) gameState.hp = 0;
    if (protect) showToast('生态护盾生效：损耗减半！', 'info');
  }

  // 记录错题
  const existingMistake = gameState.mistakes.find(m => m.id === q.id);
  if (!existingMistake) {
    gameState.mistakes.push({
      id: q.id,
      question: q.question,
      correct: q.correct,
      options: q.options,
      law: q.law,
      explain: q.explain,
      branch: q.branch,
      difficulty: q.difficulty,
      mastered: false,
      timestamp: Date.now()
    });
  } else {
    // 重置掌握状态和复习间隔
    existingMistake.mastered = false;
  }

  // 初始化/更新错题复习数据
  gameState.mistakeReviewData = gameState.mistakeReviewData || {};
  const reviewData = gameState.mistakeReviewData[q.id] || { reviewCount: 0, correctStreak: 0 };
  reviewData.reviewCount = (reviewData.reviewCount || 0) + 1;
  reviewData.correctStreak = 0;
  reviewData.lastReviewDate = formatDate(new Date());
  // 间隔重复：1天 -> 3天 -> 7天 -> 14天 -> 30天
  const intervals = [1, 3, 7, 14, 30];
  const nextIdx = Math.min(reviewData.reviewCount - 1, intervals.length - 1);
  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + intervals[nextIdx]);
  reviewData.nextReviewDate = formatDate(nextDate);
  gameState.mistakeReviewData[q.id] = reviewData;

  const hpTextEl = document.getElementById('hp-text');
  const hpBarEl = document.getElementById('hp-bar');
  if (hpTextEl) hpTextEl.textContent = `${gameState.hp}/${gameState.maxHp}`;
  if (hpBarEl) hpBarEl.style.width = `${(gameState.hp / gameState.maxHp) * 100}%`;

  if (gameState.hp <= 0) {
    showToast('生态指数归零...去错题本找回力量吧', 'error');
    setTimeout(() => {
      gameState.hp = 20;
      showPage('page-home');
      updateHomePage();
    }, 2000);
    return;
  }

  // 首次错误剧情
  if (gameState.totalAnswered === 1 && gameState.totalCorrect === 0) {
    setTimeout(() => storySystem.show('firstWrong'), 2000);
  }

  showToast('回答错误，已收录至错题本', 'error');
}

function showExplanation(q, isCorrect) {
  const lawEl = document.getElementById('explanation-law');
  const textEl = document.getElementById('explanation-text');
  const panel = document.getElementById('explanation-panel');
  if (!lawEl || !textEl || !panel) return;
  lawEl.textContent = q.law;
  textEl.textContent = q.explain;
  panel.classList.remove('hidden');
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function quizNext() {
  if (gameState.hp <= 0) {
    showPage('page-home');
    updateHomePage();
    return;
  }

  gameState.currentQuestionIndex++;

  // 更新章节进度（基于已答题目数量）
  const branch = BRANCHES.find(b => b.id === gameState.currentBranch);
  if (branch) {
    const answeredIds = gameState.answeredQuestionIds[gameState.currentBranch] || [];
    const uniqueCount = new Set(answeredIds).size;
    const progress = Math.min(uniqueCount, branch.levels);
    gameState.branchProgress[gameState.currentBranch] = progress;
  }

  renderQuestion();
  saveGameProgress();
}

function completeBranch(branchId) {
  const branch = BRANCHES.find(b => b.id === branchId);
  if (!branch) return;
  if (!gameState.completedBranches.includes(branchId)) {
    gameState.completedBranches.push(branchId);
  }
  addFragments(20);
  showToast('章节通关！获得20碎片', 'success');
  updateTaskProgress('level');
  checkAchievements();
  saveGameProgress();
  showPage('page-home');
  updateHomePage();
}

// ===== 技能提示 =====
function showSkillTip(type) {
  const tips = {
    guide: '【指引】消耗2点魔法能量，排除一个错误选项，帮助你缩小选择范围',
    shield: '【护盾】消耗3点魔法能量，激活后下一次答错不会扣除生态指数',
    rewind: '【回溯】消耗4点魔法能量，答错后可以重新选择一次答案',
    blessing: '【祝福】消耗5点魔法能量，答对后获得双倍碎片与经验奖励'
  };
  showToast(tips[type] || '', 'info');
}

// ===== 技能系统 =====
const skillSystem = {
  showGuide() {
    if (quizSystem.answered) {
      showToast('已经作答，无法使用技能', 'warning');
      return;
    }
    if (gameState.skillPoints < 2) {
      showToast('魔法能量不足！', 'warning');
      return;
    }
    const q = sessionState.currentQuestions[gameState.currentQuestionIndex];
    if (!q) return;
    const wrongOptions = q.options.map((_, i) => i).filter(i => i !== q.correct);
    if (wrongOptions.length === 0) return;

    gameState.skillPoints -= 2;
    const spEl = document.getElementById('skill-points');
    if (spEl) spEl.textContent = gameState.skillPoints;

    // 随机禁用一个错误选项
    const toDisable = wrongOptions[Math.floor(Math.random() * wrongOptions.length)];
    const optBtn = document.querySelector(`.quiz-option[data-index="${toDisable}"]`);
    if (optBtn) {
      optBtn.classList.add('disabled');
      optBtn.style.opacity = '0.3';
      optBtn.onclick = null;
    }
    gameState.skillUsage = gameState.skillUsage || {};
    gameState.skillUsage.guide = (gameState.skillUsage.guide || 0) + 1;
    sessionState.usedSkillThisQuestion = true;
    showToast('指引：已排除一个错误选项', 'info');
  },

  showShield() {
    if (gameState.skillPoints < 3) {
      showToast('魔法能量不足！', 'warning');
      return;
    }
    if (sessionState.shieldActive) {
      showToast('护盾已激活！', 'warning');
      return;
    }
    gameState.skillPoints -= 3;
    sessionState.shieldActive = true;
    const spEl = document.getElementById('skill-points');
    if (spEl) spEl.textContent = gameState.skillPoints;
    gameState.skillUsage = gameState.skillUsage || {};
    gameState.skillUsage.shield = (gameState.skillUsage.shield || 0) + 1;
    showToast('护盾已激活！下一次错误不扣血', 'success');
  },

  useRewind() {
    if (gameState.skillPoints < 4) {
      showToast('魔法能量不足！', 'warning');
      return;
    }
    if (!quizSystem.answered) return;
    gameState.skillPoints -= 4;
    const spEl = document.getElementById('skill-points');
    if (spEl) spEl.textContent = gameState.skillPoints;
    quizSystem.answered = false;
    sessionState.usedSkillThisQuestion = true;
    gameState.skillUsage = gameState.skillUsage || {};
    gameState.skillUsage.rewind = (gameState.skillUsage.rewind || 0) + 1;
    renderQuestion();
    showToast('时间回溯！请重新选择', 'info');
  },

  useBlessing() {
    if (gameState.skillPoints < 5) {
      showToast('魔法能量不足！', 'warning');
      return;
    }
    gameState.skillPoints -= 5;
    const spEl = document.getElementById('skill-points');
    if (spEl) spEl.textContent = gameState.skillPoints;
    gameState.skillUsage = gameState.skillUsage || {};
    gameState.skillUsage.blessing = (gameState.skillUsage.blessing || 0) + 1;
    addFragments(5);
    showToast('法典祝福！获得5碎片', 'success');
  }
};

// ===== 盲盒系统 =====
const gachaSystem = {
  drawing: false,

  draw() {
    if (this.drawing) return;
    if (gameState.fragments < 15) {
      showToast('碎片不足！需要15碎片', 'warning');
      return;
    }

    this.drawing = true;
    gameState.fragments -= 15;
    updateHeader();

    const box = document.getElementById('gacha-box');
    box.classList.add('gacha-shake');
    playSound('gacha');

    setTimeout(() => {
      box.classList.remove('gacha-shake');
      const result = this.rollRarity();
      const species = this.getSpeciesByRarity(result.rarity);

      if (species) {
        if (!gameState.unlockedSpecies.includes(species.id)) {
          gameState.unlockedSpecies.push(species.id);
        }
        // 分级特效
        if (species.rarity === 'SSR') {
          const spotlight = document.createElement('div');
          spotlight.className = 'gacha-spotlight';
          document.body.appendChild(spotlight);
          setTimeout(() => spotlight.remove(), 2000);
          playSound('unlock');
        } else if (species.rarity === 'SR') {
          const pulse = document.createElement('div');
          pulse.className = 'gacha-pulse-sr';
          document.body.appendChild(pulse);
          setTimeout(() => pulse.remove(), 1500);
          playSound('gacha_sr');
        } else {
          const pulse = document.createElement('div');
          pulse.className = 'gacha-pulse-r';
          document.body.appendChild(pulse);
          setTimeout(() => pulse.remove(), 1000);
          playSound('gacha_r');
        }
        this.showResult(species);
        updateTaskProgress('gacha');
        checkAchievements();
        saveGameProgress();
      }
      this.drawing = false;
    }, 1200);
  },

  rollRarity() {
    const boost = gameState.gachaBoostExpire && Date.now() < gameState.gachaBoostExpire;
    const ssrRate = boost ? 0.10 : 0.05;
    const srRate = boost ? 0.25 : 0.20;
    const rand = Math.random();
    if (rand < ssrRate) return { rarity: 'SSR' };
    if (rand < ssrRate + srRate) return { rarity: 'SR' };
    return { rarity: 'R' };
  },

  getSpeciesByRarity(rarity) {
    const pool = SPECIES_DATA.filter(s => s.rarity === rarity && !gameState.unlockedSpecies.includes(s.id));
    if (pool.length === 0) {
      const allPool = SPECIES_DATA.filter(s => !gameState.unlockedSpecies.includes(s.id));
      if (allPool.length === 0) {
        return SPECIES_DATA[Math.floor(Math.random() * SPECIES_DATA.length)];
      }
      return allPool[Math.floor(Math.random() * allPool.length)];
    }
    return pool[Math.floor(Math.random() * pool.length)];
  },

  showResult(species) {
    if (!species) return;
    const resultDiv = document.getElementById('gacha-result');
    const style = RARITY_STYLES[species.rarity];

    resultDiv.className = `bg-white/70 dark:bg-gray-800/70 backdrop-blur rounded-2xl p-6 mb-4 border-2 ${style.border} shadow-sm text-center`;
    document.getElementById('gacha-result-border').className = `w-28 h-28 mx-auto mb-3 rounded-full overflow-hidden border-4 ${style.border} ${style.glow}`;
    const gachaImg = document.getElementById('gacha-result-img');
    gachaImg.src = species.img;
    gachaImg.alt = species.name;
    gachaImg.onerror = function() {
      this.src = getSpeciesPlaceholder(species.name);
      this.onerror = null;
    };
    document.getElementById('gacha-result-rarity').textContent = style.label;
    document.getElementById('gacha-result-name').textContent = species.name;
    document.getElementById('gacha-result-desc').textContent = species.desc;

    resultDiv.classList.remove('hidden', 'animate-scale-in', 'gacha-glow', 'gacha-rumble');
    resultDiv.classList.add('animate-scale-in');

    if (species.rarity === 'SSR') {
      resultDiv.classList.add('gacha-glow');
      setTimeout(() => resultDiv.classList.remove('gacha-glow'), 1500);
    } else if (species.rarity === 'R') {
      resultDiv.classList.add('gacha-rumble');
      if (this._rumbleTimer) clearTimeout(this._rumbleTimer);
      this._rumbleTimer = setTimeout(() => {
        resultDiv.classList.remove('gacha-rumble');
        this._rumbleTimer = null;
      }, 600);
    }
  },

  closeResult() {
    const resultDiv = document.getElementById('gacha-result');
    resultDiv.classList.add('hidden');
    resultDiv.classList.remove('animate-scale-in', 'gacha-glow', 'gacha-rumble');
    resultDiv.className = 'hidden bg-white/70 dark:bg-gray-800/70 backdrop-blur rounded-2xl p-6 mb-4 border border-eco-100 dark:border-gray-700 shadow-sm text-center';
    if (this._rumbleTimer) {
      clearTimeout(this._rumbleTimer);
      this._rumbleTimer = null;
    }
  }
};

// ===== 图鉴系统 =====
const pokedexSystem = {
  currentFilter: 'all',

  filter(type) {
    this.currentFilter = type;
    document.getElementById('pokedex-filter-all').className = type === 'all' ? 'flex-1 py-2 text-xs rounded-lg bg-eco-500 text-white font-medium transition-colors' : 'flex-1 py-2 text-xs rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors';
    document.getElementById('pokedex-filter-collected').className = type === 'collected' ? 'flex-1 py-2 text-xs rounded-lg bg-eco-500 text-white font-medium transition-colors' : 'flex-1 py-2 text-xs rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors';
    document.getElementById('pokedex-filter-uncollected').className = type === 'uncollected' ? 'flex-1 py-2 text-xs rounded-lg bg-eco-500 text-white font-medium transition-colors' : 'flex-1 py-2 text-xs rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors';
    this.render();
  },

  render() {
    const grid = document.getElementById('pokedex-grid');
    const countEl = document.getElementById('pokedex-count');
    if (!grid) return;

    let filtered = SPECIES_DATA;
    if (this.currentFilter === 'collected') filtered = SPECIES_DATA.filter(s => gameState.unlockedSpecies.includes(s.id));
    if (this.currentFilter === 'uncollected') filtered = SPECIES_DATA.filter(s => !gameState.unlockedSpecies.includes(s.id));

    if (countEl) {
      const label = this.currentFilter === 'all' ? `${gameState.unlockedSpecies.length}/${SPECIES_DATA.length}` :
        this.currentFilter === 'collected' ? `${filtered.length}` : `${filtered.length}`;
      countEl.textContent = label;
    }

    grid.innerHTML = filtered.map(s => {
      const unlocked = gameState.unlockedSpecies.includes(s.id);
      const rarityClass = s.rarity.toLowerCase();
      return `
        <div class="pokedex-card ${unlocked ? 'unlocked' : 'locked'}" ${unlocked ? `onclick="pokedexSystem.showDetail(${s.id})"` : ''}>
          <div class="pokedex-rarity ${rarityClass}">${s.rarity}</div>
          <div class="aspect-square overflow-hidden bg-gray-100 dark:bg-gray-800">
            <img src="${unlocked ? s.img : 'https://placehold.co/200x200/374151/9ca3af?text=?'}"
                 alt="${s.name}" class="w-full h-full object-cover pokedex-img ${unlocked ? 'cursor-zoom-in' : ''}"
                 onerror="this.src='${getSpeciesPlaceholder(s.name)}'; this.onerror=null;"
                 ${unlocked ? `onclick="event.stopPropagation(); pokedexSystem.previewImage('${s.img}', '${s.name}')"` : ''}>
          </div>
          <div class="p-3">
            <h3 class="text-sm font-bold text-gray-800 dark:text-white">${unlocked ? s.name : '???'}</h3>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">${unlocked ? s.desc : '继续探索以解锁该物种'}</p>
            ${unlocked ? '<p class="text-[10px] text-eco-500 mt-1"><i class="fas fa-info-circle mr-0.5"></i>点击查看科学档案</p>' : ''}
          </div>
        </div>
      `;
    }).join('');
  },

  showDetail(id) {
    const s = SPECIES_DATA.find(x => x.id === id);
    if (!s || !s.sciInfo) return;
    const modal = document.getElementById('pokedex-detail-modal');
    const panel = document.getElementById('pokedex-detail-panel');
    if (!modal || !panel) return;

    const imgEl = document.getElementById('pokedex-detail-img');
    const borderEl = document.getElementById('pokedex-detail-border');
    if (imgEl) {
      imgEl.src = s.img;
      imgEl.alt = s.name;
      imgEl.classList.add('cursor-zoom-in');
      imgEl.onclick = function(e) {
        e.stopPropagation();
        pokedexSystem.previewImage(s.img, s.name);
      };
      imgEl.onerror = function() {
        this.src = getSpeciesPlaceholder(s.name);
        this.onerror = null;
      };
    }
    if (borderEl) {
      borderEl.className = `w-24 h-24 mx-auto rounded-full overflow-hidden border-4 mb-3 ${RARITY_STYLES[s.rarity].border}`;
    }
    const rarityEl = document.getElementById('pokedex-detail-rarity');
    if (rarityEl) {
      rarityEl.className = `inline-block px-2 py-0.5 text-xs rounded-md mb-1 ${RARITY_STYLES[s.rarity].badge}`;
      rarityEl.textContent = s.rarity + '级';
    }
    const nameEl = document.getElementById('pokedex-detail-name');
    if (nameEl) nameEl.textContent = s.name;
    const descEl = document.getElementById('pokedex-detail-desc');
    if (descEl) descEl.textContent = s.desc;
    const protEl = document.getElementById('pokedex-detail-protection');
    if (protEl) protEl.textContent = s.sciInfo.protection;
    const habEl = document.getElementById('pokedex-detail-habitat');
    if (habEl) habEl.textContent = s.sciInfo.habitat;
    const threatEl = document.getElementById('pokedex-detail-threat');
    if (threatEl) threatEl.textContent = s.sciInfo.threat;
    const factEl = document.getElementById('pokedex-detail-fact');
    if (factEl) factEl.textContent = s.sciInfo.fact;

    modal.classList.remove('hidden');
    setTimeout(() => panel.classList.remove('translate-y-full'), 10);
  },

  closeDetail() {
    const modal = document.getElementById('pokedex-detail-modal');
    const panel = document.getElementById('pokedex-detail-panel');
    if (panel) panel.classList.add('translate-y-full');
    if (modal) setTimeout(() => modal.classList.add('hidden'), 500);
  },

  previewImage(src, name) {
    const modal = document.getElementById('pokedex-preview-modal');
    const img = document.getElementById('pokedex-preview-img');
    const label = document.getElementById('pokedex-preview-name');
    if (!modal || !img) return;
    img.src = src;
    img.alt = name;
    img.onerror = function() {
      this.src = getSpeciesPlaceholder(name);
      this.onerror = null;
    };
    if (label) label.textContent = name;
    modal.classList.remove('hidden');
  },

  closePreview() {
    const modal = document.getElementById('pokedex-preview-modal');
    if (modal) modal.classList.add('hidden');
  }
};

// ===== 碳足迹系统 =====
const carbonSystem = {
  lastCalc: null,

  calculate() {
    const clamp = (v) => Math.max(0, Math.min(9999, parseFloat(v) || 0));
    const electric = clamp(document.getElementById('carbon-electric').value);
    const water = clamp(document.getElementById('carbon-water').value);
    const gas = clamp(document.getElementById('carbon-gas').value);
    const travel = clamp(document.getElementById('carbon-travel').value);
    const meat = clamp(document.getElementById('carbon-meat').value);

    const elecC = electric * 0.785;
    const waterC = water * 0.91;
    const gasC = gas * 2.1;
    const travelC = travel * 0.27;
    const meatC = meat * 15;
    const monthly = elecC + waterC + gasC + travelC + meatC;
    const yearly = Math.max(0, monthly * 12);
    const trees = Math.max(0, Math.ceil(yearly / 18));

    this.lastCalc = { electric: elecC * 12, water: waterC * 12, gas: gasC * 12, travel: travelC * 12, meat: meatC * 12, total: yearly };

    const totalEl = document.getElementById('carbon-total');
    const treesEl = document.getElementById('carbon-trees');
    const resultEl = document.getElementById('carbon-result');
    if (totalEl) totalEl.textContent = yearly.toFixed(1);
    if (treesEl) treesEl.textContent = trees;
    if (resultEl) resultEl.classList.remove('hidden');

    const maxRef = Math.max(yearly, 9100);
    const userBar = document.getElementById('carbon-bar-user');
    const userVal = document.getElementById('carbon-val-user');
    if (userBar) userBar.style.width = Math.min((yearly / maxRef) * 100, 100) + '%';
    if (userVal) userVal.textContent = Math.round(yearly);

    const breakdownEl = document.getElementById('carbon-breakdown');
    if (breakdownEl) {
      const items = [
        { name: '用电', val: elecC * 12, color: 'bg-yellow-400', icon: 'fa-bolt' },
        { name: '用水', val: waterC * 12, color: 'bg-blue-400', icon: 'fa-tint' },
        { name: '燃气', val: gasC * 12, color: 'bg-orange-400', icon: 'fa-fire' },
        { name: '出行', val: travelC * 12, color: 'bg-gray-400', icon: 'fa-car' },
        { name: '肉食', val: meatC * 12, color: 'bg-red-400', icon: 'fa-drumstick-bite' }
      ].sort((a, b) => b.val - a.val);
      breakdownEl.innerHTML = items.map(item => {
        const pct = yearly > 0 ? Math.round((item.val / yearly) * 100) : 0;
        return `
          <div class="flex items-center gap-2">
            <i class="fas ${item.icon} text-xs text-gray-400 w-4 text-center"></i>
            <span class="text-xs text-gray-600 dark:text-gray-400 w-10">${item.name}</span>
            <div class="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div class="h-full ${item.color} rounded-full" style="width: ${pct}%"></div>
            </div>
            <span class="text-xs text-gray-600 dark:text-gray-400 w-10 text-right">${pct}%</span>
          </div>
        `;
      }).join('');
    }

    const actionsEl = document.getElementById('carbon-actions');
    if (actionsEl) {
      const actions = [];
      if (meatC * 12 > yearly * 0.25) {
        const save = Math.round(meatC * 12 * 0.3);
        actions.push(`<div class="flex items-start gap-2"><i class="fas fa-leaf text-eco-500 text-xs mt-0.5"></i><span class="text-xs text-gray-700 dark:text-gray-300">每周素食2天，年减排约 <b>${save} kg</b> CO2</span></div>`);
      }
      if (travelC * 12 > yearly * 0.2) {
        const save = Math.round(travelC * 12 * 0.4);
        actions.push(`<div class="flex items-start gap-2"><i class="fas fa-bicycle text-eco-500 text-xs mt-0.5"></i><span class="text-xs text-gray-700 dark:text-gray-300">骑行替代50%短途出行，年减排约 <b>${save} kg</b> CO2</span></div>`);
      }
      if (elecC * 12 > yearly * 0.2) {
        const save = Math.round(elecC * 12 * 0.15);
        actions.push(`<div class="flex items-start gap-2"><i class="fas fa-plug text-eco-500 text-xs mt-0.5"></i><span class="text-xs text-gray-700 dark:text-gray-300">使用节能电器+随手关灯，年减排约 <b>${save} kg</b> CO2</span></div>`);
      }
      if (gasC * 12 > yearly * 0.15) {
        const save = Math.round(gasC * 12 * 0.2);
        actions.push(`<div class="flex items-start gap-2"><i class="fas fa-temperature-low text-eco-500 text-xs mt-0.5"></i><span class="text-xs text-gray-700 dark:text-gray-300">空调调高1度/调低1度，年减排约 <b>${save} kg</b> CO2</span></div>`);
      }
      if (actions.length === 0) {
        actions.push(`<div class="flex items-start gap-2"><i class="fas fa-heart text-eco-500 text-xs mt-0.5"></i><span class="text-xs text-gray-700 dark:text-gray-300">你的碳足迹已经很优秀了！继续保持绿色生活方式</span></div>`);
      }
      actionsEl.innerHTML = actions.join('');
    }

    let feedback = '';
    if (yearly < 2000) feedback = `你这一年的脚印，只需要${trees}棵树就能接住。地球偷偷松了口气。`;
    else if (yearly < 4000) feedback = `需要${trees}棵树才能接住你的脚印。稍微轻一点，好吗？`;
    else if (yearly < 6000) feedback = `需要${trees}棵树才能接住你的脚印...地球有点喘不过气了，从绿色出行开始改变吧。`;
    else feedback = `需要${trees}棵树才能接住你的脚印。地球在敲门：\"我们可以谈谈吗？\"`;
    const feedbackEl = document.getElementById('carbon-feedback');
    if (feedbackEl) feedbackEl.textContent = feedback;

    gameState.carbonCalculated = true;
    updateTaskProgress('carbon');
    checkAchievements();
    saveGameProgress();
  },

  createCheckinGoal() {
    if (!this.lastCalc) {
      showToast('请先计算碳足迹', 'warning');
      return;
    }
    const items = [
      { name: '用电', val: this.lastCalc.electric, action: '随手关灯、使用节能电器', checkin: 'light' },
      { name: '用水', val: this.lastCalc.water, action: '节约用水', checkin: 'water' },
      { name: '燃气', val: this.lastCalc.gas, action: '调低空调温度', checkin: 'light' },
      { name: '出行', val: this.lastCalc.travel, action: '绿色出行', checkin: 'transport' },
      { name: '肉食', val: this.lastCalc.meat, action: '光盘行动、减少肉食', checkin: 'food' }
    ].sort((a, b) => b.val - a.val);
    const top = items[0];
    showToast(`已生成目标：${top.action}，每次打卡+3碎片`, 'success');
    gameState.carbonCheckins = (gameState.carbonCheckins || 0) + 1;
    saveGameProgress();
    checkAchievements();
    showPage('page-checkin');
  }
};

// ===== 打卡系统 =====
const checkinSystem = {
  render() {
    const today = formatDate(new Date());
    const completed = Object.keys(gameState.checkinToday).filter(k => gameState.checkinToday[k]).length;
    document.getElementById('checkin-count').textContent = completed;
    document.getElementById('streak-days').textContent = gameState.streak;

    // 打卡列表
    const list = document.getElementById('checkin-list');
    list.innerHTML = CHECKIN_ITEMS.map(item => {
      const done = gameState.checkinToday[item.id];
      return `
        <button onclick="checkinSystem.doCheckin('${item.id}')" class="w-full flex items-center gap-3 p-3 rounded-xl transition-all ${done ? 'bg-eco-100 dark:bg-eco-900/30 opacity-60' : 'bg-gray-50 dark:bg-gray-800/50 hover:bg-eco-50 dark:hover:bg-eco-900/20'}">
          <div class="w-10 h-10 rounded-lg ${done ? 'bg-eco-500' : 'bg-gray-200 dark:bg-gray-700'} flex items-center justify-center">
            <i class="fas ${item.icon} ${done ? 'text-white' : 'text-gray-500 dark:text-gray-400'}"></i>
          </div>
          <div class="flex-1 text-left">
            <p class="text-sm font-medium text-gray-800 dark:text-white">${item.name}</p>
            <p class="text-xs text-gray-500 dark:text-gray-400">+3碎片</p>
          </div>
          ${done ? '<i class="fas fa-check text-eco-500"></i>' : '<i class="fas fa-plus text-gray-400"></i>'}
        </button>
      `;
    }).join('');

    // 日历
    this.renderCalendar();
  },

  doCheckin(id) {
    if (gameState.checkinToday[id]) {
      showToast('今日已打卡', 'warning');
      return;
    }
    gameState.checkinToday[id] = true;
    addFragments(3);
    updateTaskProgress('checkin');

    // 碳足迹打卡追踪
    if (gameState.carbonCalculated) {
      gameState.carbonCheckins = (gameState.carbonCheckins || 0) + 1;
    }

    // Streak逻辑
    const today = formatDate(new Date());
    if (gameState.lastCheckinDate !== today) {
      const yesterday = formatDate(new Date(Date.now() - 86400000));
      if (gameState.lastCheckinDate === yesterday) {
        gameState.streak++;
      } else {
        gameState.streak = 1;
      }
      if (gameState.streak > gameState.maxStreak) gameState.maxStreak = gameState.streak;
      gameState.lastCheckinDate = today;

      // Streak奖励
      if (gameState.streak % 7 === 0) {
        addFragments(20);
        showToast(`连续${gameState.streak}天！额外奖励20碎片`, 'success');
      }
    }

    // 记录历史
    if (!gameState.checkinHistory.includes(today)) {
      gameState.checkinHistory.push(today);
    }

    this.render();
    checkAchievements();
    saveGameProgress();
    updateHeader();
  },

  renderCalendar() {
    const calendar = document.getElementById('checkin-calendar');
    const today = new Date();
    const days = ['日', '一', '二', '三', '四', '五', '六'];

    let html = days.map(d => `<div class="text-center text-xs text-gray-500 dark:text-gray-400 font-medium">${d}</div>`).join('');

    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).getDay();
    for (let i = 0; i < firstDay; i++) {
      html += `<div></div>`;
    }

    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isChecked = gameState.checkinHistory.includes(dateStr);
      const isToday = d === today.getDate();
      html += `<div class="calendar-day ${isChecked ? 'checked' : ''} ${isToday ? 'today' : ''}">${d}</div>`;
    }

    calendar.innerHTML = html;
  }
};

// ===== 错题本 =====
const mistakeSystem = {
  currentFilter: 'all',

  filter(type) {
    this.currentFilter = type;
    document.getElementById('filter-all').className = type === 'all' ? 'flex-1 py-2 text-xs rounded-lg bg-eco-500 text-white font-medium transition-colors' : 'flex-1 py-2 text-xs rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors';
    document.getElementById('filter-weak').className = type === 'weak' ? 'flex-1 py-2 text-xs rounded-lg bg-eco-500 text-white font-medium transition-colors' : 'flex-1 py-2 text-xs rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors';
    document.getElementById('filter-mastered').className = type === 'mastered' ? 'flex-1 py-2 text-xs rounded-lg bg-eco-500 text-white font-medium transition-colors' : 'flex-1 py-2 text-xs rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors';
    this.render();
  },

  render() {
    const list = document.getElementById('mistakes-list');
    let filtered = gameState.mistakes;
    if (this.currentFilter === 'weak') filtered = gameState.mistakes.filter(m => !m.mastered);
    if (this.currentFilter === 'mastered') filtered = gameState.mistakes.filter(m => m.mastered);

    const countEl = document.getElementById('mistakes-count');
    if (countEl) countEl.textContent = `${filtered.length} 题`;

    if (filtered.length === 0) {
      if (list) list.innerHTML = `<div class="text-center py-8 text-gray-400 dark:text-gray-500"><i class="fas fa-check-circle text-3xl mb-2"></i><p class="text-sm">暂无错题</p></div>`;
      return;
    }

    if (list) list.innerHTML = filtered.map(m => {
      const reviewData = (gameState.mistakeReviewData || {})[m.id] || {};
      const nextDate = reviewData.nextReviewDate;
      const today = formatDate(new Date());
      const isDue = nextDate && nextDate <= today;
      const reviewBadge = !m.mastered && nextDate
        ? `<span class="text-[10px] px-1.5 py-0.5 rounded ${isDue ? 'bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400' : 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400'}">${isDue ? '今日待复习' : '下次复习:' + nextDate}</span>`
        : '';
      const reviewCount = reviewData.reviewCount || 0;
      const streakBadge = reviewCount > 0
        ? `<span class="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-400">已复习${reviewCount}次</span>`
        : '';
      return `
      <div class="mistake-card ${m.mastered ? 'mastered' : ''}">
        <div class="flex items-center gap-2 mb-2">
          ${reviewBadge}
          ${streakBadge}
        </div>
        <p class="text-sm font-medium text-gray-800 dark:text-white mb-2">${m.question}</p>
        <div class="bg-eco-50 dark:bg-eco-950/30 rounded-lg p-2.5 mb-2">
          <p class="text-xs text-eco-700 dark:text-eco-400"><i class="fas fa-book mr-1"></i>${m.law}</p>
        </div>
        <p class="text-xs text-gray-600 dark:text-gray-400 mb-3">${m.explain}</p>
        <div class="flex gap-2">
          <button onclick="mistakeSystem.toggleMastered(${m.id})" class="flex-1 py-2 text-xs rounded-lg ${m.mastered ? 'bg-gray-100 dark:bg-gray-800 text-gray-500' : 'bg-eco-500 text-white'} transition-colors">
            ${m.mastered ? '<i class="fas fa-undo mr-1"></i>标记未掌握' : '<i class="fas fa-check mr-1"></i>标记已掌握'}
          </button>
          <button onclick="mistakeSystem.review(${m.id})" class="px-3 py-2 text-xs rounded-lg bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-400 hover:bg-blue-200 transition-colors">
            <i class="fas fa-redo"></i>
          </button>
          <button onclick="mistakeSystem.practiceSimilar(${m.id})" class="px-3 py-2 text-xs rounded-lg bg-eco-100 dark:bg-eco-900 text-eco-700 dark:text-eco-400 hover:bg-eco-200 transition-colors">
            <i class="fas fa-dumbbell"></i>
          </button>
        </div>
      </div>
    `;
    }).join('');
  },

  toggleMastered(id) {
    const m = gameState.mistakes.find(x => x.id === id);
    if (m) {
      m.mastered = !m.mastered;
      if (m.mastered) {
        addFragments(2);
        showToast('已掌握！+2碎片', 'success');
        updateTaskProgress('review');
      }
      this.render();
      checkAchievements();
      saveGameProgress();
    }
  },

  review(id) {
    const m = gameState.mistakes.find(x => x.id === id);
    if (!m) return;
    // 更新复习 streak
    const today = formatDate(new Date());
    if (gameState.lastReviewDate !== today) {
      const yesterday = formatDate(new Date(Date.now() - 86400000));
      if (gameState.lastReviewDate === yesterday) {
        gameState.reviewStreak = (gameState.reviewStreak || 0) + 1;
      } else {
        gameState.reviewStreak = 1;
      }
      gameState.lastReviewDate = today;
    }
    // 更新错题复习数据
    gameState.mistakeReviewData = gameState.mistakeReviewData || {};
    const rd = gameState.mistakeReviewData[id] || { reviewCount: 0 };
    rd.reviewCount = (rd.reviewCount || 0) + 1;
    gameState.mistakeReviewData[id] = rd;
    saveGameProgress();
    checkAchievements();
    showToast(`正确答案: ${LETTERS[m.correct]} - ${m.options[m.correct]}`, 'info');
  },

  practiceSimilar(id) {
    const m = gameState.mistakes.find(x => x.id === id);
    if (!m) return;
    // 找到同章节的题目进行强化练习
    const branchQs = allQuestions.filter(q => q.branch === m.branch && q.id !== m.id);
    if (branchQs.length === 0) {
      showToast('该章节暂无同类练习题', 'warning');
      return;
    }
    const similar = branchQs[Math.floor(Math.random() * branchQs.length)];
    // 使用 story modal 展示同类题
    storySystem.currentStory = [{
      npc: '青芽', icon: 'fa-seedling', title: '同类强化训练',
      text: `【同类强化】${similar.question}\n\nA. ${similar.options[0]}\nB. ${similar.options[1]}\nC. ${similar.options[2]}\nD. ${similar.options[3]}\n\n（正确答案是 ${LETTERS[similar.correct]}）`
    }];
    storySystem.currentIndex = 0;
    storySystem.onComplete = null;
    storySystem.renderCurrent();
    storySystem.open();
  }
};

// ===== 商店系统 =====
const shopSystem = {
  render() {
    document.getElementById('shop-fragments').textContent = gameState.fragments;
    const grid = document.getElementById('shop-grid');
    grid.innerHTML = SHOP_ITEMS.map(item => `
      <div class="shop-card">
        <div class="w-12 h-12 mx-auto mb-2 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center">
          <i class="fas ${item.icon} text-white text-lg"></i>
        </div>
        <h3 class="text-sm font-bold text-gray-800 dark:text-white mb-1">${item.name}</h3>
        <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">${item.desc}</p>
        <button onclick="shopSystem.buy('${item.id}')" class="w-full py-2 bg-jade-500 text-white rounded-lg text-sm font-medium hover:bg-jade-600 transition-colors ${gameState.fragments < item.price ? 'opacity-50 cursor-not-allowed' : ''}">
          <i class="fas fa-gem mr-1"></i>${item.price} 碎片
        </button>
      </div>
    `).join('');
  },

  buy(itemId) {
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) return;
    if (gameState.fragments < item.price) {
      showToast('碎片不足！', 'warning');
      return;
    }
    gameState.fragments -= item.price;
    item.effect(gameState);
    // 购买获得经验
    addExp(2);
    updateHeader();
    this.render();
    showToast(`购买了${item.name}！`, 'success');
    checkAchievements();
    saveGameProgress();
  }
};

// ===== 成就系统 =====
const achievementSystem = {
  render() {
    const list = document.getElementById('achievements-list');
    if (!list) return;
    list.innerHTML = ACHIEVEMENTS.map(a => {
      const unlocked = gameState.achievements.includes(a.id);
      const cardBg = unlocked ? `background-color: ${a.bg}; border-color: transparent;` : '';
      const darkCardBg = unlocked ? `background-color: ${a.darkBg}; border-color: rgba(255,255,255,0.08);` : '';
      return `
        <div class="achievement-item ${unlocked ? 'unlocked' : 'locked'}"
             style="${cardBg}"
             data-dark-style="${darkCardBg}">
          <div class="achievement-icon bg-gradient-to-br ${unlocked ? a.color : 'from-gray-300 to-gray-400'}">
            <i class="fas ${a.icon}"></i>
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="text-sm font-bold text-gray-800 dark:text-white">${a.name}</h3>
            <p class="text-xs text-gray-500 dark:text-gray-400">${a.desc}</p>
          </div>
          ${unlocked ? `<i class="fas fa-check-circle text-transparent bg-clip-text bg-gradient-to-br ${a.color}"></i>` : '<i class="fas fa-lock text-gray-300 dark:text-gray-600"></i>'}
        </div>
      `;
    }).join('');

    // 应用深色模式下的成就背景
    if (document.documentElement.classList.contains('dark')) {
      list.querySelectorAll('.achievement-item.unlocked').forEach(el => {
        const darkStyle = el.dataset.darkStyle;
        if (darkStyle) el.style.cssText = darkStyle;
      });
    }
  }
};

function checkAchievements() {
  let newUnlock = false;
  ACHIEVEMENTS.forEach(a => {
    if (!gameState.achievements.includes(a.id) && a.condition(gameState)) {
      gameState.achievements.push(a.id);
      showToast(`解锁成就: ${a.name}`, 'success');
      newUnlock = true;
    }
  });
  if (newUnlock) playSound('levelup');
}

// ===== 北京绿色先锋 =====
const beijingSystem = {
  render() {
    ['olympic', 'greenheart', 'wenyu'].forEach(id => {
      const btn = document.getElementById(`btn-${id}`);
      if (btn && gameState.beijingClaimed[id]) {
        btn.textContent = '已领取';
        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');
      }
    });
  },

  claim(id) {
    if (gameState.beijingClaimed[id]) {
      showToast('已领取过奖励', 'warning');
      return;
    }
    gameState.beijingClaimed[id] = true;
    addFragments(10);
    const btn = document.getElementById(`btn-${id}`);
    if (btn) {
      btn.textContent = '已领取';
      btn.disabled = true;
      btn.classList.add('opacity-50', 'cursor-not-allowed');
    }
    showToast('获得10碎片', 'success');
    saveGameProgress();
  }
};

// ===== 海报系统 =====
function openPosterModal() {
  document.getElementById('poster-correct').textContent = gameState.totalCorrect;
  document.getElementById('poster-branches').textContent = gameState.completedBranches.length;
  document.getElementById('poster-achievements').textContent = gameState.achievements.length;
  document.getElementById('poster-species').textContent = gameState.unlockedSpecies.length;
  document.getElementById('poster-date').textContent = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '.');
  document.getElementById('poster-level').textContent = `Lv.${gameState.level} ${getLevelTitle(gameState.level)}`;
  const recovery = calculateGlobalRecovery();
  document.getElementById('poster-recovery').textContent = recovery.toFixed(1) + '%';
  document.getElementById('poster-recovery-bar').style.width = recovery + '%';

  const template = document.getElementById('poster-template');
  html2canvas(template, { scale: 2, backgroundColor: null }).then(canvas => {
    const result = document.getElementById('poster-result');
    result.innerHTML = '';
    const img = document.createElement('img');
    img.src = canvas.toDataURL('image/png');
    img.className = 'w-full';
    result.appendChild(img);
    document.getElementById('poster-modal').classList.remove('hidden');
  });
}

function closePoster() {
  document.getElementById('poster-modal').classList.add('hidden');
}

// ===== 学习报告 =====
function createChart(key, canvasId, type, data, options) {
  const ctx = document.getElementById(canvasId).getContext('2d');
  if (window[key]) window[key].destroy();
  window[key] = new Chart(ctx, { type, data, options });
}

const reportSystem = {
  render() {
    this.renderTrendChart();
    this.renderBranchChart();
    this.renderWeakPoints();
  },

  renderTrendChart() {
    const days = [];
    const answered = [];
    const correct = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = formatDate(d);
      days.push(`${d.getMonth() + 1}/${d.getDate()}`);
      const stat = gameState.dailyStats[ds] || { answered: 0, correct: 0 };
      answered.push(stat.answered);
      correct.push(stat.correct);
    }

    createChart('trendChart', 'chart-trend', 'line', {
      labels: days,
      datasets: [
        { label: '答题数', data: answered, borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,0.1)', tension: 0.4, fill: true },
        { label: '正确数', data: correct, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', tension: 0.4, fill: true }
      ]
    }, {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
    });
  },

  renderBranchChart() {
    const branches = ['总则', '污染防治', '生态保护', '绿色低碳', '生态责任'];
    const data = [
      gameState.branchAccuracy.general,
      gameState.branchAccuracy.pollution,
      gameState.branchAccuracy.ecology,
      gameState.branchAccuracy.lowcarbon,
      gameState.branchAccuracy.liability
    ].map(b => b.total > 0 ? Math.round((b.correct / b.total) * 100) : 0);

    createChart('branchChart', 'chart-branches', 'bar', {
      labels: branches,
      datasets: [{
        label: '正确率%',
        data: data,
        backgroundColor: ['#22c55e', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'],
        borderRadius: 6
      }]
    }, {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, max: 100 } }
    });
  },

  renderWeakPoints() {
    const list = document.getElementById('weak-points-list');
    const weakPoints = [];
    Object.keys(gameState.branchAccuracy).forEach(function(key) {
      var val = gameState.branchAccuracy[key];
      if (val.total > 0) {
        var rate = val.correct / val.total;
        if (rate < 0.7) {
          weakPoints.push({ branch: BRANCH_NAME_MAP[key], rate: Math.round(rate * 100), total: val.total });
        }
      }
    });

    let html = '';

    // 平均答题用时
    if (gameState.questionTimes && gameState.questionTimes.length > 0) {
      const avgDuration = gameState.questionTimes.reduce((sum, t) => sum + t.duration, 0) / gameState.questionTimes.length;
      const correctTimes = gameState.questionTimes.filter(t => t.correct);
      const wrongTimes = gameState.questionTimes.filter(t => !t.correct);
      const avgCorrect = correctTimes.length > 0 ? correctTimes.reduce((sum, t) => sum + t.duration, 0) / correctTimes.length : 0;
      const avgWrong = wrongTimes.length > 0 ? wrongTimes.reduce((sum, t) => sum + t.duration, 0) / wrongTimes.length : 0;

      html += `
        <div class="bg-eco-50 dark:bg-eco-950/30 rounded-xl p-3 mb-3 border border-eco-100 dark:border-eco-800">
          <p class="text-xs text-gray-500 dark:text-gray-400 mb-2"><i class="fas fa-clock mr-1 text-eco-500"></i>答题用时分析（最近${gameState.questionTimes.length}题）</p>
          <div class="grid grid-cols-3 gap-2 text-center">
            <div>
              <p class="text-lg font-bold text-eco-700 dark:text-eco-400">${avgDuration.toFixed(1)}s</p>
              <p class="text-[10px] text-gray-500 dark:text-gray-400">平均用时</p>
            </div>
            <div>
              <p class="text-lg font-bold text-eco-700 dark:text-eco-400">${avgCorrect.toFixed(1)}s</p>
              <p class="text-[10px] text-gray-500 dark:text-gray-400">答对平均</p>
            </div>
            <div>
              <p class="text-lg font-bold text-rose-600 dark:text-rose-400">${avgWrong.toFixed(1)}s</p>
              <p class="text-[10px] text-gray-500 dark:text-gray-400">答错平均</p>
            </div>
          </div>
        </div>
      `;

      // 各难度平均用时
      const diffMap = { easy: '基础', medium: '进阶', hard: '困难' };
      const diffColors = { easy: 'text-eco-600 dark:text-eco-400', medium: 'text-amber-600 dark:text-amber-400', hard: 'text-red-600 dark:text-red-400' };
      const diffHtml = ['easy', 'medium', 'hard'].map(diff => {
        const times = gameState.questionTimes.filter(t => t.difficulty === diff);
        if (times.length === 0) return '';
        const avg = times.reduce((sum, t) => sum + t.duration, 0) / times.length;
        return `<span class="text-[10px] ${diffColors[diff]}">${diffMap[diff]}: ${avg.toFixed(1)}s (${times.length}题)</span>`;
      }).filter(Boolean).join(' <span class="text-gray-300 dark:text-gray-600">|</span> ');

      if (diffHtml) {
        html += `<div class="flex flex-wrap items-center gap-1 mb-3">${diffHtml}</div>`;
      }
    }

    if (weakPoints.length === 0) {
      html += '<p class="text-sm text-gray-500 dark:text-gray-400 text-center">暂无薄弱点，继续保持！</p>';
      if (list) list.innerHTML = html;
      return;
    }

    html += weakPoints.map(wp => `
      <div class="flex items-center gap-3">
        <span class="text-sm text-gray-700 dark:text-gray-300 flex-1">${wp.branch}</span>
        <div class="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden max-w-[120px]">
          <div class="h-full bg-red-400 rounded-full" style="width: ${wp.rate}%"></div>
        </div>
        <span class="text-xs text-gray-500 dark:text-gray-400 w-10 text-right">${wp.rate}%</span>
      </div>
    `).join('');

    if (list) list.innerHTML = html;
  }
};

// ===== 随机事件 =====
function checkRandomEvent() {
  if (Math.random() > 0.3) return; // 30%概率触发
  const event = RANDOM_EVENTS[Math.floor(Math.random() * RANDOM_EVENTS.length)];
  gameState.randomEvent = event;

  const banner = document.getElementById('random-event-banner');
  const titleEl = document.getElementById('random-event-title');
  const descEl = document.getElementById('random-event-desc');
  if (!banner || !titleEl || !descEl) return;

  titleEl.textContent = event.title;
  descEl.textContent = event.desc;
  banner.classList.remove('hidden');
  banner.classList.add('animate-slide-up');

  const durationMs = (event.duration || 30) * 60 * 1000;

  if (event.type === 'multiplier' && event.multiplier) {
    sessionState.eventMultiplier = event.multiplier;
    gameState.eventMultiplierExpire = Date.now() + durationMs;
    showToast(`突发事件：答题奖励 x${event.multiplier}！`, 'success');
  } else if (event.type === 'gacha_boost') {
    gameState.gachaBoostExpire = Date.now() + durationMs;
    showToast('突发事件：物种盲盒SSR概率翻倍！', 'success');
  } else if (event.type === 'hp_protect') {
    gameState.hpProtectExpire = Date.now() + durationMs;
    showToast('突发事件：生态护盾启动，损耗减半！', 'success');
  } else if (event.type === 'bonus') {
    gameState.eventBonus = { amount: event.bonus || 0, claimed: false, trigger: event.trigger };
    const triggerText = event.trigger === 'first_answer' ? '今日首次答题' : '今日完成环保使命';
    showToast(`突发事件：${triggerText}额外获得${event.bonus}碎片！`, 'success');
  }

  updateEventCountdown();
  startEventCountdown();
}

function checkEventEffects() {
  let expired = false;
  if (gameState.eventMultiplierExpire && Date.now() > gameState.eventMultiplierExpire) {
    sessionState.eventMultiplier = 1;
    gameState.eventMultiplierExpire = null;
    expired = true;
  }
  if (gameState.gachaBoostExpire && Date.now() > gameState.gachaBoostExpire) {
    gameState.gachaBoostExpire = null;
    expired = true;
  }
  if (gameState.hpProtectExpire && Date.now() > gameState.hpProtectExpire) {
    gameState.hpProtectExpire = null;
    expired = true;
  }
  if (expired && gameState.totalAnswered > 0) {
    showToast('突发事件已结束', 'info');
    const banner = document.getElementById('random-event-banner');
    if (banner) banner.classList.add('hidden');
  }
}

function dismissEventBanner() {
  const banner = document.getElementById('random-event-banner');
  if (banner) banner.classList.add('hidden');
}

function updateEventCountdown() {
  const el = document.getElementById('event-countdown');
  if (!el) return;
  const expires = [gameState.eventMultiplierExpire, gameState.gachaBoostExpire, gameState.hpProtectExpire].filter(Boolean);
  if (expires.length === 0) {
    el.textContent = '';
    stopEventCountdown();
    return;
  }
  const nearest = Math.min(...expires);
  const remaining = Math.max(0, nearest - Date.now());
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  el.textContent = `剩余 ${mins}:${secs.toString().padStart(2, '0')}`;
}

function startRandomEventQuiz() {
  // 随机选择一个未完成的章节
  const available = BRANCHES.filter(b => !gameState.completedBranches.includes(b.id));
  const branch = available.length > 0 ? available[0] : BRANCHES[0];
  startBranch(branch.id);
}

// ===== 夜间模式 =====
function toggleDarkMode() {
  document.documentElement.classList.toggle('dark');
  const isDark = document.documentElement.classList.contains('dark');
  const icon = document.getElementById('dark-mode-icon');
  const toggle = document.getElementById('dark-mode-toggle');
  const knob = document.getElementById('dark-mode-knob');
  if (icon) icon.className = isDark ? 'fas fa-sun text-yellow-400 text-xs' : 'fas fa-moon text-gray-600 text-xs';
  if (toggle) toggle.className = `w-12 h-6 rounded-full relative transition-colors ${isDark ? 'bg-eco-500' : 'bg-gray-300'}`;
  if (knob) knob.className = `w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all shadow-sm ${isDark ? 'left-6' : 'left-0.5'}`;
  saveGameProgress();
}

function handleAvatarUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    gameState.avatar = dataUrl;
    const imgEl = document.getElementById('settings-avatar-img');
    const placeholderEl = document.getElementById('settings-avatar-placeholder');
    if (imgEl) {
      imgEl.src = dataUrl;
      imgEl.style.display = 'block';
    }
    if (placeholderEl) placeholderEl.style.display = 'none';
    // 同步首页头像
    const headerImg = document.getElementById('header-avatar');
    const headerIcon = document.getElementById('header-avatar-icon');
    if (headerImg) {
      headerImg.src = dataUrl;
      headerImg.removeAttribute('style');
      headerImg.classList.remove('hidden');
    }
    if (headerIcon) headerIcon.classList.add('hidden');
    saveGameProgress();
    showToast('头像更换成功！', 'success');
  };
  reader.readAsDataURL(file);
  input.value = '';
}

function loadAvatar() {
  const imgEl = document.getElementById('settings-avatar-img');
  const placeholderEl = document.getElementById('settings-avatar-placeholder');
  const headerImg = document.getElementById('header-avatar');
  const headerIcon = document.getElementById('header-avatar-icon');
  if (gameState.avatar && imgEl) {
    imgEl.src = gameState.avatar;
    imgEl.style.display = 'block';
    if (placeholderEl) placeholderEl.style.display = 'none';
  }
  if (gameState.avatar && headerImg) {
    headerImg.src = gameState.avatar;
    headerImg.removeAttribute('style');
    headerImg.classList.remove('hidden');
    if (headerIcon) headerIcon.classList.add('hidden');
  }
}

function toggleSound() {
  gameState.soundEnabled = !gameState.soundEnabled;
  const enabled = gameState.soundEnabled;
  const toggle = document.getElementById('sound-toggle');
  const knob = document.getElementById('sound-knob');
  if (toggle) toggle.className = `w-12 h-6 rounded-full relative transition-colors ${enabled ? 'bg-eco-500' : 'bg-gray-300'}`;
  if (knob) knob.className = `w-5 h-5 rounded-full bg-white absolute top-0.5 transition-all shadow-sm ${enabled ? 'left-6' : 'left-0.5'}`;
  saveGameProgress();
}

// ===== 方法挂载 =====
quizSystem.next = quizNext;

// ===== 全局初始化 =====
document.addEventListener('DOMContentLoaded', initApp);

// 防止页面刷新时丢失进度
window.addEventListener('beforeunload', function() {
  saveGameProgress();
});
