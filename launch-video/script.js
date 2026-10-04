/* PewnySzlak launch film — GSAP cinematic timeline (~45s) */
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const caption = {
    el: $('#caption'),
    kicker: $('#captionKicker'),
    title: $('#captionTitle'),
    body: $('#captionBody'),
  };

  const scenes = {
    intro: $('.scene-intro'),
    prefs: $('#scenePrefs'),
    explore: $('#sceneExplore'),
    guide: $('#sceneGuide'),
    chat: $('#sceneChat'),
    end: $('#sceneEnd'),
  };

  const deviceWrap = $('#deviceWrap');
  const modeBike = $('[data-mode="bike"]');
  const prefIncline = $('#prefIncline');
  const len50 = $('#len50');
  const planRoute = $('#planRoute');
  const mapBadge = $('#mapBadge');
  const variantCard = $('#variantCard');
  const ctaAccept = $('#ctaAccept');
  const navProgress = $('#navProgress');
  const userDot = $('#userDot');
  const guideStep = $('#guideStep');
  const guideNext = $('#guideNext');
  const bubbleUser = $('#bubbleUser');
  const bubbleBot = $('#bubbleBot');
  const foodCards = $$('[data-food]');

  function showApp(name) {
    $$('.app-scene').forEach((el) => {
      const on = el.dataset.app === name;
      el.classList.toggle('is-hidden', !on);
      gsap.set(el, { opacity: on ? 1 : 0, y: on ? 0 : 12 });
    });
  }

  function setCaption(kicker, title, body) {
    caption.kicker.textContent = kicker;
    caption.title.textContent = title;
    caption.body.textContent = body;
  }

  function buildTimeline() {
    const tl = gsap.timeline({
      defaults: { ease: 'power3.out' },
      paused: true,
      onComplete: () => {
        scenes.end.classList.remove('is-hidden');
        gsap.fromTo(scenes.end, { opacity: 0 }, { opacity: 1, duration: 0.8 });
      },
    });

    // Reset state
    gsap.set(deviceWrap, { opacity: 0, visibility: 'hidden', scale: 0.86, y: 40 });
    gsap.set(caption.el, { opacity: 0, y: 20 });
    gsap.set(scenes.intro, { opacity: 1 });
    gsap.set('.intro-logo', { scale: 0.6, opacity: 0 });
    gsap.set('.intro-title', { y: 30, opacity: 0 });
    gsap.set('.intro-sub', { y: 16, opacity: 0 });
    gsap.set(planRoute, { strokeDashoffset: 420 });
    gsap.set(navProgress, { strokeDashoffset: 400 });
    gsap.set(userDot, { attr: { transform: 'translate(40 180)' } });
    gsap.set([bubbleUser, bubbleBot, ...foodCards], { opacity: 0, y: 16 });
    $$('.mode-chip').forEach((c) => c.classList.remove('is-on'));
    modeBike.classList.remove('is-on');
    scenes.end.classList.add('is-hidden');
    showApp('prefs');

    // ——— 0. Brand open ———
    tl.addLabel('intro')
      .to('.intro-logo', { scale: 1, opacity: 1, duration: 0.9, ease: 'back.out(1.6)' })
      .to('.intro-title', { y: 0, opacity: 1, duration: 0.8 }, '-=0.45')
      .to('.intro-sub', { y: 0, opacity: 1, duration: 0.6 }, '-=0.45')
      .to({}, { duration: 0.7 })
      .to(scenes.intro, { opacity: 0, duration: 0.7 })
      .set(scenes.intro, { visibility: 'hidden' });

    // ——— 1. Device + preferences ———
    tl.addLabel('prefs')
      .call(() => {
        showApp('prefs');
        setCaption('01', 'Preferencje', 'Tryby jazdy i limity komfortu');
      })
      .set(deviceWrap, { visibility: 'visible' })
      .to(deviceWrap, { opacity: 1, scale: 1, y: 0, duration: 1.1, ease: 'power4.out' })
      .to(caption.el, { opacity: 1, y: 0, duration: 0.7 }, '-=0.6')
      .from('#scenePrefs .mode-chip', {
        opacity: 0,
        y: 18,
        stagger: 0.08,
        duration: 0.45,
      }, '-=0.35')
      .from('#scenePrefs .prefs-card', { opacity: 0, y: 20, duration: 0.5 }, '-=0.2')
      .to({}, { duration: 0.45 });

    // ——— 2. Select bicycle ———
    tl.addLabel('bike')
      .call(() => setCaption('02', 'Rower', 'Wybór trybu aktywności'))
      .to(caption.el, { opacity: 0, y: 10, duration: 0.25 })
      .call(() => setCaption('02', 'Rower', 'Wybór trybu aktywności'))
      .to(caption.el, { opacity: 1, y: 0, duration: 0.4 })
      .to(modeBike, {
        duration: 0.15,
        onStart: () => {
          $$('.mode-chip').forEach((c) => c.classList.remove('is-on'));
          modeBike.classList.add('is-on');
        },
      })
      .fromTo(modeBike, { scale: 0.96 }, { scale: 1.06, duration: 0.28, yoyo: true, repeat: 1, ease: 'power2.inOut' })
      .to(prefIncline, { duration: 0.01, onStart: () => { prefIncline.textContent = 'do 12%'; } })
      .to({}, { duration: 0.9 });

    // ——— 3. Explore: 50 km round trip ———
    tl.addLabel('route')
      .to(caption.el, { opacity: 0, duration: 0.25 })
      .call(() => {
        setCaption('03', '50 km', 'Tam i z powrotem · pod Twoje limity');
        showApp('explore');
        gsap.fromTo('#sceneExplore', { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.55 });
      })
      .to(caption.el, { opacity: 1, duration: 0.45 })
      .from('#lengthRow .len-chip', { opacity: 0, y: 10, stagger: 0.06, duration: 0.35 }, '-=0.2')
      .to(len50, {
        duration: 0.2,
        onStart: () => {
          $$('#lengthRow .len-chip').forEach((c) => c.classList.remove('is-on'));
          len50.classList.add('is-on');
        },
      })
      .fromTo(len50, { scale: 1 }, { scale: 1.08, duration: 0.25, yoyo: true, repeat: 1 })
      .to('#tripRound', { scale: 1.05, duration: 0.2, yoyo: true, repeat: 1 })
      .to(mapBadge, { opacity: 1, duration: 0.2 })
      .to(planRoute, { strokeDashoffset: 0, duration: 2.2, ease: 'power2.inOut' })
      .call(() => { mapBadge.textContent = '49,8 km · pętla gotowa'; })
      .from(variantCard, { opacity: 0, y: 16, duration: 0.5 }, '-=0.4')
      .from(ctaAccept, { opacity: 0, y: 12, duration: 0.4 }, '-=0.2')
      .to(ctaAccept, { scale: 1.04, duration: 0.22, yoyo: true, repeat: 1, ease: 'power2.inOut' })
      .to({}, { duration: 0.55 });

    // ——— 4. GPS navigation ———
    tl.addLabel('gps')
      .to(caption.el, { opacity: 0, duration: 0.25 })
      .call(() => {
        setCaption('04', 'GPS', 'Prowadzenie od startu trasy');
        showApp('guide');
        gsap.fromTo('#sceneGuide', { opacity: 0, scale: 0.98 }, { opacity: 1, scale: 1, duration: 0.55 });
      })
      .to(caption.el, { opacity: 1, duration: 0.4 })
      .from('#guideHero', { opacity: 0, y: 14, duration: 0.45 }, '-=0.2')
      .from('.guide-badges .g-badge', { opacity: 0, y: 8, stagger: 0.08, duration: 0.35 }, '-=0.2')
      .to(navProgress, { strokeDashoffset: 120, duration: 2.8, ease: 'power1.inOut' }, '-=0.1')
      .to(userDot, {
        duration: 2.8,
        ease: 'power1.inOut',
        attr: { transform: 'translate(140 110)' },
      }, '<')
      .call(() => {
        guideStep.textContent = 'Skręć w lewo w ul. Starowiślną';
        guideNext.textContent = 'Za 180 m: kontynuuj prosto';
      })
      .fromTo('#gpsBadge', { scale: 0.9 }, { scale: 1.08, duration: 0.25, yoyo: true, repeat: 1 })
      .to({}, { duration: 0.7 });

    // ——— 5. Smart assistant / burgers ———
    tl.addLabel('assistant')
      .to(caption.el, { opacity: 0, duration: 0.25 })
      .call(() => {
        setCaption('05', 'Asystent', 'Burgery przy Twojej trasie');
        showApp('chat');
        gsap.fromTo('#sceneChat', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.5 });
      })
      .to(caption.el, { opacity: 1, duration: 0.4 })
      .to(bubbleUser, { opacity: 1, y: 0, duration: 0.45 })
      .to(bubbleBot, { opacity: 1, y: 0, duration: 0.55 }, '+=0.25')
      .to(foodCards, {
        opacity: 1,
        y: 0,
        stagger: 0.18,
        duration: 0.4,
        onComplete: () => {},
      }, '-=0.15')
      .to(foodCards[0], {
        duration: 0.35,
        onStart: () => foodCards[0].classList.add('is-hot'),
      })
      .to({}, { duration: 1.1 })
      .to([deviceWrap, caption.el], { opacity: 0, duration: 0.7, ease: 'power2.inOut' })
      .set(deviceWrap, { visibility: 'hidden' });

    return tl;
  }

  let timeline = buildTimeline();

  function play() {
    scenes.end.classList.add('is-hidden');
    timeline.kill();
    timeline = buildTimeline();
    timeline.play(0);
  }

  $('#btnPlay').addEventListener('click', play);
  $('#btnReplay').addEventListener('click', play);

  // Auto-play shortly after load for recording convenience
  window.addEventListener('load', () => {
    setTimeout(play, 600);
  });

  // Keyboard: Space = replay
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      play();
    }
  });
})();
