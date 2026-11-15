import React, { useState, useEffect } from 'react';
import {
  ArrowRight,
  Check,
  X,
  LayoutGrid,
  Layers,
  DollarSign,
  Clock,
  Sparkles,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Building,
} from 'lucide-react';
import './LandingPage.css';

export default function LandingPage({ onLogin, onGetStarted, user, tenant }) {
  // ─── Hero Tab State with Automatic Cycling & Hover Pause (No visible control buttons) ──
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'seatmap' | 'budget'
  const [isHovered, setIsHovered] = useState(false);
  const [progress, setProgress] = useState(0);

  const SLIDE_DURATION = 4500; // 4.5 seconds per slide
  const tabs = ['overview', 'seatmap', 'budget'];

  // Seamless background autoplay progress increment
  useEffect(() => {
    if (isHovered) return;

    const intervalTime = 50;
    const increment = (intervalTime / SLIDE_DURATION) * 100;

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev + increment >= 100) {
          return 100;
        }
        return prev + increment;
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, [isHovered, activeTab]);

  // Clean transition to the next tab when progress reaches 100%
  useEffect(() => {
    if (progress >= 100) {
      const currentIdx = tabs.indexOf(activeTab);
      const nextIdx = (currentIdx + 1) % tabs.length;
      setActiveTab(tabs[nextIdx]);
      setProgress(0);
    }
  }, [progress, activeTab]);

  const handleTabSelect = (tab) => {
    setActiveTab(tab);
    setProgress(0);
  };

  // ─── FAQ Accordion State ──────────────────────────────────────────────────
  const [openFaq, setOpenFaq] = useState(0);

  const faqs = [
    {
      q: 'Do students need to install any app to use LibMa?',
      a: 'No app installation required. Students receive lightweight WhatsApp and SMS alerts with direct web links for fee receipts, digital student cards, and UPI renewals right in their browser.',
    },
    {
      q: 'Can I manage my study center from my smartphone?',
      a: 'Yes. LibMa is 100% responsive and optimized for mobile browsers. You can check occupied desks, log cash payments, and assign lockers right from your phone while walking the aisles.',
    },
    {
      q: 'Does LibMa support multiple branches or floors?',
      a: 'Absolutely. You can switch between floors or distinct physical branches with a single click, with isolated billing records and unified owner reporting.',
    },
    {
      q: 'Is there a free trial before I commit?',
      a: 'Yes, we offer a full-featured 14-day free trial so you can map your seats, test automated WhatsApp & SMS reminders, and onboard students with zero financial commitment.',
    },
  ];

  // ─── Floating Card Metadata per slide ─────────────────────────────────────
  const floatingCardData = {
    overview: {
      title: 'While you slept',
      tag: '04:00 AM',
      items: [
        { done: true, text: 'Sent fee reminders via WhatsApp & SMS', highlight: '(24)' },
        { done: true, text: 'Released seats from expired plans', highlight: '(3)' },
        { done: true, text: 'Reconciled cash and UPI payments', highlight: '(₹14,200)' },
        { done: false, text: "Generated today's collection forecast", highlight: 'Ready' },
      ],
    },
    seatmap: {
      title: 'Shift: Morning (6AM - 12PM)',
      tag: 'Realtime',
      items: [
        { done: true, text: 'Main Reading Hall: 79% occupied', highlight: '27/34' },
        { done: true, text: 'Available Desks:', highlight: 'A-05, A-11' },
        { done: true, text: 'Next shift handover starts in', highlight: '1 hr 15m' },
        { done: false, text: 'Zero overlapping desk collisions detected', highlight: 'Clean' },
      ],
    },
    budget: {
      title: 'Monthly Net Profit',
      tag: '₹12,001',
      items: [
        { done: true, text: 'Monthly Fee Revenue:', highlight: '₹80,050 (79 students)' },
        { done: true, text: 'Property Rent:', highlight: '₹32,000 (47%)' },
        { done: true, text: 'Electricity & AC Power:', highlight: '₹16,850' },
        { done: false, text: 'Net Operating Margin:', highlight: '15% of gross' },
      ],
    },
  };

  const activeFloating = floatingCardData[activeTab];

  return (
    <div className="landing-page">
      {/* ──────────────────────────────────────────────────────────────────
          1. TOP ANNOUNCEMENT BAR
          ────────────────────────────────────────────────────────────────── */}
      <div className="lp-announcement-bar">
        <span className="lp-announcement-tag">New</span>
        <span>Locker management is live: map, assign and bill lockers right next to your seats</span>
      </div>

      {/* ──────────────────────────────────────────────────────────────────
          2. STICKY NAVBAR
          ────────────────────────────────────────────────────────────────── */}
      <header className="lp-navbar">
        <div className="lp-container lp-nav-inner">
          <a href="#" className="lp-brand-logo">
            <div className="lp-brand-icon-wrap">
              <img src="/brand/libma-icon.svg" alt="LibMa Logo" />
            </div>
            <span>LibMa</span>
          </a>

          <nav className="lp-nav-links">
            <a href="#features" className="lp-nav-link">Product</a>
            <a href="#how-it-works" className="lp-nav-link">How it works</a>
            <a href="#pricing" className="lp-nav-link">Pricing</a>
            <a href="#faq" className="lp-nav-link">FAQ</a>
          </nav>

          <div className="lp-nav-actions">
            {user ? (
              <button
                type="button"
                onClick={onLogin}
                className="lp-btn-cta-nav"
              >
                <span>Dashboard</span>
                <ArrowRight size={14} />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onLogin}
                  className="lp-btn-login"
                >
                  Log in
                </button>
                <button
                  type="button"
                  onClick={onGetStarted}
                  className="lp-btn-cta-nav"
                >
                  <span>Get early access</span>
                  <ArrowRight size={14} />
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* ──────────────────────────────────────────────────────────────────
            3. HERO SECTION
            ────────────────────────────────────────────────────────────────── */}
        <section className="lp-hero-section">
          <div className="lp-container">
            <div className="lp-hero-grid">
              {/* Left Column: Value Prop */}
              <div>
                <div className="lp-badge-facility">
                  <span className="lp-pulsing-dot" />
                  <span>Autonomous Facility OS</span>
                </div>

                <h1 className="lp-hero-title">
                  The front desk that <br />
                  <span className="lp-editorial">never sleeps.</span>
                </h1>

                <p className="lp-hero-subtitle">
                  LibMa is the operating system for your self-study center. Fees, seats,
                  lockers, shifts, and WhatsApp reminders run themselves, so you open the day to
                  collected payments, not a ledger.
                </p>

                <div className="lp-hero-buttons">
                  <button
                    type="button"
                    onClick={onGetStarted}
                    className="lp-btn-primary"
                  >
                    <span>Get early access</span>
                    <ArrowRight size={16} />
                  </button>

                  <a href="#how-it-works" className="lp-btn-secondary">
                    <span>See how it works</span>
                    <ArrowRight size={14} />
                  </a>
                </div>

                <div className="lp-social-proof">
                  <div className="lp-avatar-stack">
                    <div className="lp-avatar-bubble lp-av-1">AK</div>
                    <div className="lp-avatar-bubble lp-av-2">SR</div>
                    <div className="lp-avatar-bubble lp-av-3">MP</div>
                    <div className="lp-avatar-bubble lp-av-4">VT</div>
                  </div>
                  <p className="lp-proof-text">
                    Trusted by <span className="lp-proof-highlight">200+ study centers</span> across 14 cities
                  </p>
                </div>
              </div>

              {/* Right Column: Hero Product Preview (Real Full-Res App Screenshots) */}
              <div
                className="lp-hero-preview-wrapper"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
              >
                {/* Clean Tab Switcher Bar (Autoplay & Hover effect active; visible toggle buttons removed) */}
                <div className="lp-preview-top-controls">
                  <div className="lp-tabs-pill-bar">
                    {/* Tab 1: Overview */}
                    <button
                      type="button"
                      className={`lp-tab-pill-btn ${activeTab === 'overview' ? 'active' : ''}`}
                      onClick={() => handleTabSelect('overview')}
                    >
                      {activeTab === 'overview' && (
                        <div
                          className="lp-tab-pill-progress"
                          style={{ width: `${progress}%` }}
                        />
                      )}
                      <span className="lp-tab-pill-content">
                        <LayoutGrid size={13} />
                        <span>Overview</span>
                      </span>
                    </button>

                    {/* Tab 2: Visual Seat Map */}
                    <button
                      type="button"
                      className={`lp-tab-pill-btn ${activeTab === 'seatmap' ? 'active' : ''}`}
                      onClick={() => handleTabSelect('seatmap')}
                    >
                      {activeTab === 'seatmap' && (
                        <div
                          className="lp-tab-pill-progress"
                          style={{ width: `${progress}%` }}
                        />
                      )}
                      <span className="lp-tab-pill-content">
                        <Layers size={13} />
                        <span>Visual Seat Map</span>
                      </span>
                    </button>

                    {/* Tab 3: Budget & Profit */}
                    <button
                      type="button"
                      className={`lp-tab-pill-btn ${activeTab === 'budget' ? 'active' : ''}`}
                      onClick={() => handleTabSelect('budget')}
                    >
                      {activeTab === 'budget' && (
                        <div
                          className="lp-tab-pill-progress"
                          style={{ width: `${progress}%` }}
                        />
                      )}
                      <span className="lp-tab-pill-content">
                        <DollarSign size={13} />
                        <span>Budget & Profit</span>
                      </span>
                    </button>
                  </div>
                </div>

                {/* Offset Decorative Block */}
                <div className="lp-preview-offset-block" />

                {/* Main Dark Browser Window Frame */}
                <div className="lp-browser-frame">
                  {/* Browser Header Bar */}
                  <div className="lp-browser-header">
                    <div className="lp-browser-dots">
                      <span className="lp-dot lp-dot-red" />
                      <span className="lp-dot lp-dot-yellow" />
                      <span className="lp-dot lp-dot-green" />
                      <div className="lp-browser-url-pill">
                        <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: '#10B981', display: 'inline-block' }} />
                        <span>
                          {activeTab === 'overview' && 'app.libma.in/dashboard'}
                          {activeTab === 'seatmap' && 'app.libma.in/seatmap'}
                          {activeTab === 'budget' && 'app.libma.in/budget'}
                        </span>
                      </div>
                    </div>

                    <div className="lp-browser-live-tag">
                      <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#10B981', display: 'inline-block' }} />
                      <span>
                        {activeTab === 'overview' && 'Live center view'}
                        {activeTab === 'seatmap' && '27 / 34 Desks Occupied'}
                        {activeTab === 'budget' && 'October 2026'}
                      </span>
                    </div>
                  </div>

                  {/* ──────────────────────────────────────────────────────────
                      SCREEN VIEWPORT (ACTUAL FULL-RESOLUTION WEBSITE SCREENSHOTS)
                      ────────────────────────────────────────────────────────── */}
                  <div className="lp-screen-viewport">
                    {/* Slide 1: Actual Dashboard Overview */}
                    <div className={`lp-screenshot-slide ${activeTab === 'overview' ? 'active' : ''}`}>
                      <img
                        src="/screenshots/dashboard-overview.png"
                        alt="LibMa Dashboard Overview"
                        className="lp-screenshot-img"
                        loading="eager"
                      />
                    </div>

                    {/* Slide 2: Actual Visual Seat Map */}
                    <div className={`lp-screenshot-slide ${activeTab === 'seatmap' ? 'active' : ''}`}>
                      <img
                        src="/screenshots/visual-seat-map.png"
                        alt="LibMa Visual Seat Map"
                        className="lp-screenshot-img"
                        loading="eager"
                      />
                    </div>

                    {/* Slide 3: Actual Budget & Profit */}
                    <div className={`lp-screenshot-slide ${activeTab === 'budget' ? 'active' : ''}`}>
                      <img
                        src="/screenshots/budget-profit.png"
                        alt="LibMa Budget & Profit"
                        className="lp-screenshot-img"
                        loading="eager"
                      />
                    </div>
                  </div>

                  {/* Linear progress bar strip beneath window */}
                  <div className="lp-screen-progress-bar">
                    <div
                      className="lp-screen-progress-fill"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* Overlapping White Floating Card ("While You Slept") */}
                <div className="lp-floating-card">
                  <div className="lp-floating-header">
                    <span className="lp-floating-title">
                      <span>{activeFloating.title}</span>
                      <Check size={14} className="lp-check-green" strokeWidth={3} />
                    </span>
                    <span className="lp-floating-tag">{activeFloating.tag}</span>
                  </div>

                  <div className="lp-floating-list">
                    {activeFloating.items.map((item, idx) => (
                      <div key={idx} className="lp-floating-item">
                        {item.done ? (
                          <span className="lp-check-green">✓</span>
                        ) : (
                          <span style={{ color: 'var(--lp-primary)', fontWeight: 800 }}>⏳</span>
                        )}
                        <span>
                          {item.text} <strong className="lp-highlight-terracotta">{item.highlight}</strong>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ──────────────────────────────────────────────────────────────────
            4. THIN STRIP BANNER
            ────────────────────────────────────────────────────────────────── */}
        <section className="lp-strip-banner">
          <div className="lp-container">
            <p className="lp-strip-text">
              Built for owners of: &nbsp;&nbsp;Self-study centers &nbsp;·&nbsp; Reading rooms &nbsp;·&nbsp; Libraries &nbsp;·&nbsp; Coaching hubs
            </p>
          </div>
        </section>

        {/* ──────────────────────────────────────────────────────────────────
            5. FEATURES SECTION
            ────────────────────────────────────────────────────────────────── */}
        <section className="lp-features-section" id="features">
          <div className="lp-container">
            <div className="lp-section-header">
              <span className="lp-section-badge">What LibMa runs for you</span>
              <h2 className="lp-section-title">
                Everything your center does, <span className="lp-editorial">handled.</span>
              </h2>
              <p className="lp-section-desc">
                Replace fragmented WhatsApp groups, paper registers, and awkward payment calls with
                an automated front desk that gives you your evenings back.
              </p>
            </div>

            <div className="lp-features-grid">
              {/* Card 1: Fee & Billing */}
              <div className="lp-feature-card">
                <div>
                  <div className="lp-feature-icon-box">
                    <DollarSign size={22} strokeWidth={2} />
                  </div>
                  <h3 className="lp-feature-title">Fee & billing</h3>
                  <p className="lp-feature-desc">
                    Price per shift per month. Bill for a seat, a locker, or bundle both with
                    automatic prorated invoices and instant digital receipts.
                  </p>
                </div>
                <div className="lp-feature-footer">
                  <span>Automated Proration</span>
                  <span>→</span>
                </div>
              </div>

              {/* Card 2: Visual Seat Map */}
              <div className="lp-feature-card">
                <div>
                  <div className="lp-feature-icon-box">
                    <LayoutGrid size={22} strokeWidth={2} />
                  </div>
                  <h3 className="lp-feature-title">Visual seat map</h3>
                  <p className="lp-feature-desc">
                    Lay out every floor and quiet zone. Click any desk to assign a student,
                    swap seats, or mark maintenance in real-time.
                  </p>
                </div>
                <div className="lp-feature-footer">
                  <span>Multi-floor Support</span>
                  <span>→</span>
                </div>
              </div>

              {/* Card 3: Locker Management */}
              <div className="lp-feature-card">
                <div>
                  <div className="lp-feature-icon-box">
                    <Layers size={22} strokeWidth={2} />
                  </div>
                  <h3 className="lp-feature-title">Locker management</h3>
                  <p className="lp-feature-desc">
                    Create, map, assign and bill lockers right alongside student seat reservations.
                    Prevent double assignments and dead locker space.
                  </p>
                </div>
                <div className="lp-feature-footer">
                  <span>Asset Tagging & Sync</span>
                  <span>→</span>
                </div>
              </div>

              {/* Card 4: WhatsApp & SMS Payment Reminders (Terracotta Highlight) */}
              <div className="lp-feature-card highlight">
                <div>
                  <div className="lp-feature-icon-box">
                    <MessageSquare size={22} strokeWidth={2} />
                  </div>
                  <h3 className="lp-feature-title">WhatsApp & SMS reminders</h3>
                  <p className="lp-feature-desc">
                    Automated collection prompts. Students receive timely reminders with dynamic UPI
                    links 3 days before renewal, cutting late fees by 80%.
                  </p>
                </div>
                <div className="lp-feature-footer">
                  <span>Zero Awkward Phone Calls</span>
                  <span>→</span>
                </div>
              </div>

              {/* Card 5: Shifts & Slots */}
              <div className="lp-feature-card">
                <div>
                  <div className="lp-feature-icon-box">
                    <Clock size={22} strokeWidth={2} />
                  </div>
                  <h3 className="lp-feature-title">Shifts & slots</h3>
                  <p className="lp-feature-desc">
                    Morning, evening, full-day, night, or custom slot schedules. Zero overlaps,
                    guaranteed desk availability without human calculation.
                  </p>
                </div>
                <div className="lp-feature-footer">
                  <span>Overlap Verification</span>
                  <span>→</span>
                </div>
              </div>

              {/* Card 6: Multi-Center Cloud (Dark) */}
              <div className="lp-feature-card dark">
                <div>
                  <div className="lp-feature-icon-box">
                    <Building size={22} strokeWidth={2} />
                  </div>
                  <h3 className="lp-feature-title">Built for many centers</h3>
                  <p className="lp-feature-desc">
                    Private cloud workspace per owner. Manage 1 center or multiple branches seamlessly
                    from phone or laptop with unified reports.
                  </p>
                </div>
                <div className="lp-feature-footer">
                  <span>Multi-Tenant Architecture</span>
                  <span>→</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ──────────────────────────────────────────────────────────────────
            6. HOW IT WORKS SECTION
            ────────────────────────────────────────────────────────────────── */}
        <section className="lp-container" id="how-it-works">
          <div className="lp-how-section">
            <span className="lp-how-badge">Set up in four steps</span>
            <h2 className="lp-how-title">
              From signup to a running center, in <span className="lp-editorial">one sitting.</span>
            </h2>

            <div className="lp-how-grid">
              <div className="lp-how-col">
                <span className="lp-how-num">01</span>
                <h4 className="lp-how-step-title">Add your library</h4>
                <p className="lp-how-step-desc">
                  Set up operating hours, branch locations, and Wi-Fi or locker inventory rules for your specific spaces.
                </p>
              </div>

              <div className="lp-how-col">
                <span className="lp-how-num">02</span>
                <h4 className="lp-how-step-title">Define your shifts</h4>
                <p className="lp-how-step-desc">
                  Create full-day, morning, evening, or custom timed slots tailored to competitive exam study schedules.
                </p>
              </div>

              <div className="lp-how-col">
                <span className="lp-how-num">03</span>
                <h4 className="lp-how-step-title">Set your prices</h4>
                <p className="lp-how-step-desc">
                  Configure monthly seat rates, refundable security deposits, and locker add-on charges per shift.
                </p>
              </div>

              <div className="lp-how-col">
                <span className="lp-how-num">04</span>
                <h4 className="lp-how-step-title">Lay out your seats</h4>
                <p className="lp-how-step-desc">
                  Draw your floor plan with our visual desk builder and immediately open desk allocations to new patrons.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ──────────────────────────────────────────────────────────────────
            7. PRICING SECTION
            ────────────────────────────────────────────────────────────────── */}
        <section className="lp-pricing-section" id="pricing">
          <div className="lp-container">
            <div className="lp-section-header" style={{ textAlign: 'center' }}>
              <span className="lp-pricing-badge">Predictable Software Costs</span>
              <h2 className="lp-section-title" style={{ maxWidth: 700, margin: '0 auto 16px auto' }}>
                Fair, transparent pricing for growing study spaces.
              </h2>
              <p className="lp-section-desc" style={{ maxWidth: 600, margin: '0 auto' }}>
                No setup fees, no patron commissions. Keep 100% of your seat and locker collections.
              </p>
            </div>

            <div className="lp-pricing-grid">
              {/* Card 1: Starter Pack (₹249) */}
              <div className="lp-pricing-card">
                <div>
                  <h3 className="lp-price-tier-name">Starter Pack</h3>
                  <p className="lp-price-tier-desc">For independent reading rooms getting organized.</p>

                  <div className="lp-price-amount-row">
                    <span className="lp-price-val">₹249</span>
                    <span className="lp-price-unit">/month</span>
                  </div>

                  <ul className="lp-pricing-features">
                    <li>
                      <Check size={16} color="var(--lp-primary)" strokeWidth={2.5} />
                      <span>Limited to <strong>50 active seats</strong></span>
                    </li>
                    <li>
                      <Check size={16} color="var(--lp-primary)" strokeWidth={2.5} />
                      <span>Visual seat & desk map</span>
                    </li>
                    <li>
                      <Check size={16} color="var(--lp-primary)" strokeWidth={2.5} />
                      <span>Manual fee receipts & billing ledger</span>
                    </li>
                    <li>
                      <Check size={16} color="var(--lp-primary)" strokeWidth={2.5} />
                      <span>Student directory & attendance</span>
                    </li>
                    <li className="lp-feature-excluded">
                      <X size={16} color="#DC2626" strokeWidth={2.5} />
                      <span style={{ textDecoration: 'line-through' }}>WhatsApp & SMS reminders</span>
                    </li>
                    <li>
                      <Check size={16} color="var(--lp-primary)" strokeWidth={2.5} />
                      <span>Standard email support</span>
                    </li>
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={onGetStarted}
                  className="lp-price-btn lp-price-btn-outline"
                >
                  Choose Starter
                </button>
              </div>

              {/* Card 2: Growth (Featured - ₹499 - All Features) */}
              <div className="lp-pricing-card featured">
                <span className="lp-popular-tag">Most Popular</span>

                <div>
                  <h3 className="lp-price-tier-name">Growth</h3>
                  <p className="lp-price-tier-desc">All features for busy self-study centers automating daily ops.</p>

                  <div className="lp-price-amount-row">
                    <span className="lp-price-val">₹499</span>
                    <span className="lp-price-unit">/month</span>
                  </div>

                  <ul className="lp-pricing-features">
                    <li>
                      <Sparkles size={16} color="var(--lp-primary)" strokeWidth={2.5} />
                      <span><strong>All features included</strong></span>
                    </li>
                    <li>
                      <Check size={16} color="var(--lp-primary)" strokeWidth={2.5} />
                      <span>Up to <strong>150 active seats</strong></span>
                    </li>
                    <li>
                      <Check size={16} color="var(--lp-primary)" strokeWidth={2.5} />
                      <span>Automated <strong>WhatsApp & SMS fee reminders</strong></span>
                    </li>
                    <li>
                      <Check size={16} color="var(--lp-primary)" strokeWidth={2.5} />
                      <span>Locker management module</span>
                    </li>
                    <li>
                      <Check size={16} color="var(--lp-primary)" strokeWidth={2.5} />
                      <span>UPI auto-reconciliation & digital receipts</span>
                    </li>
                    <li>
                      <Check size={16} color="var(--lp-primary)" strokeWidth={2.5} />
                      <span>Priority WhatsApp support</span>
                    </li>
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={onGetStarted}
                  className="lp-price-btn lp-price-btn-primary"
                >
                  Start 14-day free trial
                </button>
              </div>

              {/* Card 3: Quarterly Plan (₹1399) */}
              <div className="lp-pricing-card dark">
                <span className="lp-popular-tag" style={{ backgroundColor: '#111111', borderColor: 'var(--lp-primary-tint)', color: 'var(--lp-primary-tint)' }}>
                  Best Value
                </span>

                <div>
                  <h3 className="lp-price-tier-name">Quarterly Plan</h3>
                  <p className="lp-price-tier-desc">All features with quarterly savings for growing libraries.</p>

                  <div className="lp-price-amount-row">
                    <span className="lp-price-val">₹1,399</span>
                    <span className="lp-price-unit">/quarter (3 months)</span>
                  </div>

                  <ul className="lp-pricing-features">
                    <li>
                      <Sparkles size={16} color="var(--lp-primary-tint)" strokeWidth={2.5} />
                      <span><strong>All Growth features included</strong></span>
                    </li>
                    <li>
                      <Check size={16} color="var(--lp-primary-tint)" strokeWidth={2.5} />
                      <span><strong>Unlimited</strong> seats & lockers</span>
                    </li>
                    <li>
                      <Check size={16} color="var(--lp-primary-tint)" strokeWidth={2.5} />
                      <span>Automated WhatsApp & SMS reminders</span>
                    </li>
                    <li>
                      <Check size={16} color="var(--lp-primary-tint)" strokeWidth={2.5} />
                      <span>Multi-shift & floor analytics</span>
                    </li>
                    <li>
                      <Check size={16} color="var(--lp-primary-tint)" strokeWidth={2.5} />
                      <span>Save vs monthly renewal</span>
                    </li>
                    <li>
                      <Check size={16} color="var(--lp-primary-tint)" strokeWidth={2.5} />
                      <span>Priority onboarding & support</span>
                    </li>
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={onGetStarted}
                  className="lp-price-btn lp-price-btn-white"
                >
                  Choose Quarterly
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ──────────────────────────────────────────────────────────────────
            8. FAQ SECTION (ACCORDION)
            ────────────────────────────────────────────────────────────────── */}
        <section className="lp-faq-section" id="faq">
          <div className="lp-container">
            <div className="lp-faq-grid">
              {/* Left Column */}
              <div>
                <h2 className="lp-section-title">
                  Questions owners ask.
                </h2>
                <p className="lp-section-desc">
                  Everything you need to know about setting up LibMa for your center. No hardware required.
                </p>

                <div className="lp-faq-help-box">
                  <div className="lp-faq-help-icon">
                    <MessageSquare size={20} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: '0.92rem' }}>Need a custom setup?</div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--lp-ink-muted)' }}>
                      Talk with our onboarding architects today.
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Interactive Accordion */}
              <div className="lp-faq-accordion">
                {faqs.map((faq, idx) => {
                  const isOpen = openFaq === idx;
                  return (
                    <div key={idx} className="lp-faq-item">
                      <button
                        type="button"
                        className="lp-faq-question"
                        onClick={() => setOpenFaq(isOpen ? -1 : idx)}
                      >
                        <span>{faq.q}</span>
                        {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                      {isOpen && (
                        <p className="lp-faq-answer">
                          {faq.a}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* ──────────────────────────────────────────────────────────────────
            9. FINAL CALL TO ACTION SECTION
            ────────────────────────────────────────────────────────────────── */}
        <div className="lp-container">
          <section className="lp-cta-card">
            <div className="lp-cta-inner">
              <h2 className="lp-cta-title">
                Give your center an ops teammate that <span className="lp-editorial" style={{ textDecorationColor: '#FFFFFF' }}>never sleeps.</span>
              </h2>
              <p className="lp-cta-desc">
                Join modern study room owners saving 15+ hours weekly on fee collection and desk allocation.
              </p>

              <button
                type="button"
                onClick={onGetStarted}
                className="lp-btn-cta-dark"
              >
                <span>Get early access</span>
                <ArrowRight size={16} />
              </button>

              <p className="lp-cta-subtext">
                No credit card required &nbsp;•&nbsp; 14-day free trial &nbsp;•&nbsp; Import your current roster in 5 mins
              </p>
            </div>
          </section>
        </div>
      </main>

      {/* ──────────────────────────────────────────────────────────────────
          10. FOOTER
          ────────────────────────────────────────────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-container">
          <div className="lp-footer-grid">
            <div className="lp-footer-brand-col">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <img
                  src="/brand/libma-icon.svg"
                  alt="LibMa"
                  style={{ width: 48, height: 48, filter: 'brightness(0) invert(1)' }}
                />
                <span style={{ fontSize: '31px', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.025em' }}>LibMa</span>
              </div>
              <p style={{ fontSize: '0.86rem', color: '#D4D4D8', maxWidth: 320, margin: 0, lineHeight: 1.5 }}>
                The modern operating system engineered for self-study centers, reading rooms, and distraction-free academic suites.
              </p>
              <span style={{
                display: 'inline-block',
                padding: '4px 10px',
                borderRadius: 9999,
                fontSize: 10,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                backgroundColor: 'rgba(255,255,255,0.08)',
                color: 'var(--lp-primary-tint)',
                border: '1px solid rgba(194,65,12,0.4)',
              }}>
                Self-study center OS
              </span>
            </div>

            <div className="lp-footer-links-grid">
              <div className="lp-footer-col">
                <span className="lp-footer-heading">Platform</span>
                <a href="#features" className="lp-footer-link">Desk & Seat Mapping</a>
                <a href="#features" className="lp-footer-link">Locker Management</a>
                <a href="#features" className="lp-footer-link">Patron Check-In</a>
                <a href="#features" className="lp-footer-link">WhatsApp Reminders</a>
              </div>

              <div className="lp-footer-col">
                <span className="lp-footer-heading">Resources</span>
                <a href="#how-it-works" className="lp-footer-link">Operating Guides</a>
                <a href="#pricing" className="lp-footer-link">Pricing Plans</a>
                <a href="#faq" className="lp-footer-link">Support & FAQ</a>
                <a href="#pricing" className="lp-footer-link">Hardware Partners</a>
              </div>

              <div className="lp-footer-col">
                <span className="lp-footer-heading">Company</span>
                <a href="#" className="lp-footer-link">About LibMa</a>
                <a href="#" className="lp-footer-link">Privacy Policy</a>
                <a href="#" className="lp-footer-link">Terms of Service</a>
                <a href="#" className="lp-footer-link">Contact Team</a>
              </div>
            </div>
          </div>

          <div className="lp-footer-bottom">
            <span>© 2026 LibMa. All rights reserved.</span>
            <span>Dedicated to the quiet craft of learning.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
