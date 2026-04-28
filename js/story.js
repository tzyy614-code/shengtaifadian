// ===== 剧情系统 =====
const storySystem = {
  currentStory: [],
  currentIndex: 0,
  isTyping: false,
  typeTimer: null,

  open() {
    const modal = document.getElementById('story-modal');
    const panel = document.getElementById('story-panel');
    if (!modal || !panel) return;
    if (this._closeTimer) {
      clearTimeout(this._closeTimer);
      this._closeTimer = null;
    }
    modal.classList.remove('hidden');
    setTimeout(() => panel.classList.add('open'), 10);
  },

  close() {
    const modal = document.getElementById('story-modal');
    const panel = document.getElementById('story-panel');
    if (panel) panel.classList.remove('open');
    if (modal) {
      this._closeTimer = setTimeout(() => {
        modal.classList.add('hidden');
        this._closeTimer = null;
      }, 500);
    }
    this.isTyping = false;
    if (this.typeTimer) clearTimeout(this.typeTimer);
  },

  skip() {
    this.close();
    if (this.onComplete) this.onComplete();
  },

  show(storyKey, onComplete) {
    const story = STORY_DATA[storyKey];
    if (!story) return;
    this.currentStory = Array.isArray(story) ? story : [story];
    this.currentIndex = 0;
    this.onComplete = onComplete;
    this.currentKey = storyKey;
    // 显示跳过按钮（非首次观看的剧情）
    const skipBtn = document.getElementById('story-skip-btn');
    if (skipBtn) {
      const seen = gameState.shownStories && gameState.shownStories.includes(storyKey);
      skipBtn.classList.toggle('hidden', !seen);
    }
    this.renderCurrent();
    this.open();
  },

  renderCurrent() {
    const data = this.currentStory[this.currentIndex];
    if (!data) return;

    const nameEl = document.getElementById('story-npc-name');
    const titleEl = document.getElementById('story-npc-title');
    const iconEl = document.getElementById('story-npc-icon');
    const textEl = document.getElementById('story-text');
    const cursorEl = document.getElementById('story-cursor');
    const nextBtn = document.getElementById('story-next-btn');

    if (!textEl || !cursorEl || !nextBtn) return;

    if (nameEl) nameEl.textContent = data.npc;
    if (titleEl) titleEl.textContent = data.title || '法典精灵';
    if (iconEl) iconEl.className = `fas ${data.icon} text-white text-2xl`;

    textEl.textContent = '';
    cursorEl.style.display = 'inline-block';
    this.isTyping = true;

    let i = 0;
    const type = () => {
      if (i < data.text.length) {
        textEl.textContent += data.text[i];
        i++;
        this.typeTimer = setTimeout(type, 35);
      } else {
        this.isTyping = false;
        cursorEl.style.display = 'none';
        if (this.currentIndex >= this.currentStory.length - 1) {
          nextBtn.textContent = '出发';
        } else {
          nextBtn.textContent = '继续';
        }
      }
    };
    // 延迟100ms开始打字，确保面板动画已展开，避免不同步
    this.typeTimer = setTimeout(type, 100);
  },

  next() {
    if (this.isTyping) {
      // 跳过打字
      const data = this.currentStory[this.currentIndex];
      const textEl = document.getElementById('story-text');
      const cursorEl = document.getElementById('story-cursor');
      if (textEl) textEl.textContent = data.text;
      if (cursorEl) cursorEl.style.display = 'none';
      this.isTyping = false;
      if (this.typeTimer) clearTimeout(this.typeTimer);
      return;
    }

    this.currentIndex++;
    if (this.currentIndex >= this.currentStory.length) {
      // 记录已观看的剧情
      if (this.currentKey && gameState.shownStories) {
        if (!gameState.shownStories.includes(this.currentKey)) {
          gameState.shownStories.push(this.currentKey);
          saveGameProgress();
        }
      }
      this.close();
      if (this.onComplete) this.onComplete();
      return;
    }
    this.renderCurrent();
  },

  startDaily() {
    const lines = STORY_DATA.daily;
    if (!lines || lines.length === 0) return;
    const line = lines[Math.floor(Math.random() * lines.length)];
    this.currentStory = [line];
    this.currentIndex = 0;
    this.renderCurrent();
    this.open();
  }
};

// ===== Boss战系统 =====
const bossSystem = {
  currentBranch: null,
  questions: [],
  currentQIndex: 0,
  lives: 3,
  wrongCount: 0,

  show(branchId) {
    const branch = BRANCHES.find(b => b.id === branchId);
    if (!branch) return;
    this.currentBranch = branch;
    const bossName = document.getElementById('boss-name');
    const bossDesc = document.getElementById('boss-desc');
    const battleName = document.getElementById('boss-battle-name');
    const battleDesc = document.getElementById('boss-battle-desc');
    const modal = document.getElementById('boss-modal');
    if (bossName) bossName.textContent = branch.bossName;
    if (bossDesc) bossDesc.textContent = branch.bossDesc;
    if (battleName) battleName.textContent = branch.bossName;
    if (battleDesc) battleDesc.textContent = branch.bossDesc;
    if (modal) modal.classList.remove('hidden');
  },

  close() {
    const modal = document.getElementById('boss-modal');
    if (modal) modal.classList.add('hidden');
  },

  start() {
    this.close();
    const branchQs = allQuestions.filter(q => q.branch === this.currentBranch.id);
    if (branchQs.length === 0) {
      showToast('该章节暂无Boss题目', 'warning');
      return;
    }
    if (branchQs.length < 5) {
      showToast(`该章节题目不足，暂无法开启Boss战（需要5题，当前${branchQs.length}题）`, 'warning');
      return;
    }
    // 选5道最难的题
    const hardQs = branchQs.filter(q => q.difficulty === 'hard');
    const mediumQs = branchQs.filter(q => q.difficulty === 'medium');
    const easyQs = branchQs.filter(q => q.difficulty === 'easy');
    this.questions = [];
    while (this.questions.length < 5 && hardQs.length > 0) {
      const idx = Math.floor(Math.random() * hardQs.length);
      this.questions.push(hardQs.splice(idx, 1)[0]);
    }
    while (this.questions.length < 5 && mediumQs.length > 0) {
      const idx = Math.floor(Math.random() * mediumQs.length);
      this.questions.push(mediumQs.splice(idx, 1)[0]);
    }
    while (this.questions.length < 5 && easyQs.length > 0) {
      const idx = Math.floor(Math.random() * easyQs.length);
      this.questions.push(easyQs.splice(idx, 1)[0]);
    }
    this.currentQIndex = 0;
    this.lives = 3;
    this.wrongCount = 0;
    gameState.inBossBattle = true;
    gameState.currentBranch = this.currentBranch.id;
    this.showBossQuestion();
    showPage('page-boss');
  },

  showBossQuestion() {
    if (this.currentQIndex >= this.questions.length) {
      this.win();
      return;
    }
    if (this.wrongCount >= 3) {
      this.lose();
      return;
    }

    const q = this.questions[this.currentQIndex];
    const area = document.getElementById('boss-question-area');
    if (!area) return;
    const letters = ['A', 'B', 'C', 'D'];

    let optionsHtml = '';
    q.options.forEach((opt, i) => {
      optionsHtml += `<button class="quiz-option w-full text-left" onclick="bossSystem.answer(${i})" data-index="${i}">
        <span class="quiz-option-letter">${letters[i]}</span>
        <span class="text-sm text-gray-700 dark:text-gray-300">${opt}</span>
      </button>`;
    });

    area.innerHTML = `
      <div class="bg-white/70 dark:bg-gray-800/70 backdrop-blur rounded-2xl p-5 mb-4 border border-eco-100 dark:border-gray-700 shadow-sm">
        <div class="flex items-center justify-between mb-4">
          <span class="px-2 py-0.5 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-400 text-[10px] font-bold rounded-md">Boss题 ${this.currentQIndex + 1}/5</span>
          <span class="px-2 py-0.5 bg-rose-100 dark:bg-rose-900 text-rose-700 dark:text-rose-400 text-[10px] rounded-md">
            <i class="fas fa-heart mr-1"></i>${this.lives} 生命
          </span>
        </div>
        <h3 class="text-base font-medium text-gray-800 dark:text-white leading-relaxed mb-5">${q.question}</h3>
        <div class="space-y-2.5">${optionsHtml}</div>
      </div>
    `;
  },

  answer(index) {
    const q = this.questions[this.currentQIndex];
    const options = document.querySelectorAll('#boss-question-area .quiz-option');
    options.forEach(opt => opt.classList.add('disabled'));

    if (index === q.correct) {
      options[index].classList.add('correct');
      playSound('correct');
      showToast('回答正确！', 'success');
      gameState.totalCorrect++;
      gameState.totalAnswered++;
      // Boss战奖励更多
      addFragments(5);
    } else {
      options[index].classList.add('wrong');
      options[q.correct].classList.add('correct');
      playSound('wrong');
      if (sessionState.shieldActive) {
        sessionState.shieldActive = false;
        showToast('护盾抵挡了Boss的伤害！', 'info');
      } else {
        showToast('回答错误！损失1点生命', 'error');
        this.lives--;
        this.wrongCount++;
      }
      gameState.totalAnswered++;
      // 记录错题
      if (!gameState.mistakes.find(m => m.id === q.id)) {
        gameState.mistakes.push({ id: q.id, question: q.question, correct: q.correct, options: q.options, law: q.law, explain: q.explain, mastered: false, timestamp: Date.now() });
      }
    }

    setTimeout(() => {
      this.currentQIndex++;
      this.showBossQuestion();
    }, 1000);
  },

  win() {
    playSound('levelup');
    gameState.inBossBattle = false;
    gameState.bossDefeated++;
    if (!gameState.defeatedBosses.includes(this.currentBranch.id)) {
      gameState.defeatedBosses.push(this.currentBranch.id);
    }
    // 通关章节
    if (!gameState.completedBranches.includes(this.currentBranch.id)) {
      gameState.completedBranches.push(this.currentBranch.id);
    }
    // 满血击败追踪（Boss战中不损失生命）
    if (this.lives >= 3) {
      gameState.fullHpBossDefeat = (gameState.fullHpBossDefeat || 0) + 1;
      showToast('完美执法！无损伤击败Boss', 'success');
    }
    addFragments(30);
    showToast(`击败了${this.currentBranch.bossName}！获得30碎片`, 'success');

    // 剧情
    const storyKey = 'bossDefeat_' + this.currentBranch.id;
    if (STORY_DATA[storyKey]) {
      storySystem.show(storyKey, () => {
        showPage('page-home');
        updateHomePage();
      });
    } else {
      showPage('page-home');
      updateHomePage();
    }
    checkAchievements();
    saveGameProgress();
  },

  lose() {
    playSound('wrong');
    gameState.inBossBattle = false;
    showToast('挑战失败...但知识已经积累，下次再来！', 'warning');
    showPage('page-home');
    updateHomePage();
    saveGameProgress();
  }
};

// 处理动态的bossDefeat剧情
Object.keys(STORY_DATA.bossDefeat).forEach(key => {
  STORY_DATA['bossDefeat_' + key] = STORY_DATA.bossDefeat[key];
});
