/**
 * Smart Engine Client-Side Port
 * Performs instant local rule-based category, priority, and safety detection
 * without needing a python backend server.
 */
const SmartEngine = {
  CATEGORIES: [
    'Electrical', 'Plumbing', 'Furniture', 'Cleaning',
    'Classroom', 'Internet/Network', 'Security', 'Infrastructure', 'Other'
  ],

  CATEGORY_KEYWORDS: {
    'Electrical': [
      'fan', 'light', 'bulb', 'tube', 'tubelight', 'switch', 'switchboard', 'spark', 'sparks',
      'wire', 'wiring', 'short circuit', 'power', 'socket', 'plug', 'electricity', 'generator',
      'ac', 'air conditioner', 'hvac', 'breaker', 'fuse', 'voltage', 'blackout', 'shock', 'mcb'
    ],
    'Plumbing': [
      'water', 'leak', 'leaking', 'leakage', 'pipe', 'tap', 'faucet', 'sink', 'washroom', 'toilet',
      'restroom', 'flush', 'drain', 'drainage', 'clog', 'clogged', 'overflow', 'sewage', 'basin',
      'geyser', 'shower', 'tank', 'valve', 'drip', 'dripping'
    ],
    'Furniture': [
      'chair', 'desk', 'bench', 'table', 'podium', 'cupboard', 'almirah', 'board', 'whiteboard',
      'blackboard', 'greenboard', 'door', 'window', 'handle', 'hinge', 'lock', 'cabinet', 'shelf',
      'drawer', 'cushion', 'armrest', 'leg', 'screw', 'loose screw', 'broken chair', 'broken table'
    ],
    'Classroom': [
      'projector', 'screen', 'mic', 'microphone', 'speaker', 'audio', 'podium', 'smart board',
      'hdmi', 'marker', 'duster', 'curtain', 'blinds', 'lectern', 'av', 'display', 'amplifier',
      'camera', 'classroom', 'lecture hall', 'seminar'
    ],
    'Internet/Network': [
      'wifi', 'wi-fi', 'internet', 'lan', 'ethernet', 'router', 'network', 'signal', 'connection',
      'slow internet', 'no internet', 'ip', 'port', 'switch port', 'access point', 'modem'
    ],
    'Cleaning': [
      'dirty', 'dust', 'garbage', 'trash', 'dustbin', 'waste', 'clean', 'cleaning', 'sweep',
      'mop', 'smell', 'odor', 'stain', 'spill', 'unhygienic', 'litter', 'mud', 'spiderweb', 'cobweb'
    ],
    'Security': [
      'theft', 'stolen', 'cctv', 'camera', 'security', 'guard', 'id card', 'gate', 'lock broken',
      'trespassing', 'unauthorized', 'vandalism', 'fight', 'harassment', 'emergency exit', 'alarm'
    ],
    'Infrastructure': [
      'wall', 'ceiling', 'floor', 'tile', 'tiles', 'crack', 'roof', 'stairs', 'staircase', 'elevator',
      'lift', 'railing', 'pavement', 'road', 'balcony', 'plaster', 'paint', 'corridor', 'ramp', 'pothole'
    ]
  },

  /**
   * Deterministic 4-level Priority Classification:
   * - Critical: immediate danger (sparking electrical wires, fire, structural collapse risk, sewage overflow, flooding near electrical)
   * - High: essential service unavailable or serious repair (no water, major leak, several fans/lights failing in occupied area)
   * - Medium: localized functional problem (one broken fan/light, leaking tap, area needing cleaning)
   * - Low: minor cosmetic or non-urgent maintenance (peeling paint, scuff, minor scratch, aesthetic)
   * Evaluates in strict order of severity so the most serious matching condition always wins.
   */
  classifyPriority(category = '', description = '', location = '') {
    const text = `${category} ${description} ${location}`.toLowerCase();

    // 1. CRITICAL: Immediate danger (Level 4)
    const criticalRules = [
      /\b(spark|sparks|sparking)\b/,
      /\bexposed\s+(electric\s+)?wire(s)?\b/,
      /\b(short\s*circuit|live\s+wire|electric\s+shock|shock\s+hazard)\b/,
      /\b(fire|flames?|burning|smoke|explosion)\b/,
      /\b(structural\s+collapse|collapse\s+risk|ceiling\s+collapse|falling\s+ceiling|wall\s+collapse|slab\s+collapse)\b/,
      /\bsewage\s*(overflow|leak|leakage|backup)?\b/,
      /\bflood(ing)?\s+(near|around|involving)\s+(electrical|equipment|socket|switch|wire|panel)\b/,
      /\b(water\s+near\s+(electrical|switch|socket|wire)|electrical\s+flooding)\b/,
      /\bgas\s+leak\b/
    ];

    for (const rule of criticalRules) {
      if (rule.test(text)) {
        return {
          priority: 'Critical',
          level: 4,
          is_safety_hazard: true,
          rationale: 'Critical: Immediate danger detected (Critical priority 4).'
        };
      }
    }

    // 2. HIGH: Essential service unavailable or serious repair needed (Level 3)
    const highRules = [
      /\bno\s+water\b/,
      /\b(water\s+cut|water\s+unavailable|dry\s+tap(s)?|no\s+running\s+water)\b/,
      /\b(major|heavy|massive|gushing)\s+(water\s+)?leak(age)?\b/,
      /\b(pipe\s+burst|burst\s+pipe)\b/,
      /\b(several|multiple|all)\s+(ceiling\s+)?(fans?|lights?)\s+(failing|failed|broken|not\s+working)\b/,
      /\b(several|multiple|all)\s+(fans?|lights?)\b/,
      /\b(complete\s+)?blackout\b/,
      /\bno\s+power\s+in\s+(the\s+)?(lab|classroom|building|hall|floor)\b/,
      /\b(elevator|lift)\s+(stuck|trapped|failure)\b/,
      /\b(no\s+lights|power\s+outage)\b/
    ];

    for (const rule of highRules) {
      if (rule.test(text)) {
        return {
          priority: 'High',
          level: 3,
          is_safety_hazard: false,
          rationale: 'High: Essential service unavailable or serious repair required (High priority 3).'
        };
      }
    }

    // 3. MEDIUM: Localized functional problem (Level 2)
    const mediumRules = [
      /\b(one|single|a)?\s*(broken|damaged|faulty)?\s*(fan|light|bulb|tubelight|tube\s+light)\b/,
      /\b(fan|light|bulb|tubelight|switch|socket)\s*(not\s+working|broken|faulty|fused)\b/,
      /\b(leaking|dripping|minor\s+leak)\s*(tap|faucet|sink|flush)?\b/,
      /\b(tap|faucet|sink|flush)\s*(is\s+)?(leaking|dripping|running|stuck)\b/,
      /\b(sink|basin|drain)\s*(clogged|blocked)\b/,
      /\b(area\s+)?need(s|ing)?\s+clean(ing)?\b/,
      /\b(dirty|dust|dusty|garbage|trash|spill|stain|litter|waste|foul\s+smell|odor)\b/,
      /\b(projector|microphone|mic|speaker|hdmi|audio)\s*(not\s+working|broken)?\b/,
      /\b(chair|desk|table|door|lock|handle|window)\s*(broken|damaged|jammed|wobbly)\b/
    ];

    for (const rule of mediumRules) {
      if (rule.test(text)) {
        return {
          priority: 'Medium',
          level: 2,
          is_safety_hazard: false,
          rationale: 'Medium: Localized functional problem affecting fixture or room (Medium priority 2).'
        };
      }
    }

    // 4. LOW: Minor cosmetic or non-urgent maintenance (Level 1)
    const lowRules = [
      /\b(cosmetic|paint|peeling\s+paint|paint\s+peeling|repaint|scuff|scratch|minor\s+scratch)\b/,
      /\b(aesthetic|whitewash|loose\s+screw|squeak(ing)?|notice\s+board|curtain|blinds|cobweb)\b/,
      /\b(minor|routine|non-urgent|not\s+urgent)\b/
    ];

    for (const rule of lowRules) {
      if (rule.test(text)) {
        return {
          priority: 'Low',
          level: 1,
          is_safety_hazard: false,
          rationale: 'Low: Minor cosmetic or non-urgent maintenance (Low priority 1).'
        };
      }
    }

    // Category default
    if (['Cleaning', 'Furniture'].includes(category)) {
      return {
        priority: 'Low',
        level: 1,
        is_safety_hazard: false,
        rationale: 'Low: Routine or non-urgent maintenance (Low priority 1).'
      };
    }

    return {
      priority: 'Medium',
      level: 2,
      is_safety_hazard: false,
      rationale: 'Medium: Standard localized maintenance request (Medium priority 2).'
    };
  },

  analyze(description = '', location = '') {
    const text = (description + ' ' + location).toLowerCase();

    // Category classification
    let bestCat = 'Other';
    let maxMatches = 0;
    for (const [cat, keywords] of Object.entries(this.CATEGORY_KEYWORDS)) {
      let matches = 0;
      for (const kw of keywords) {
        if (text.includes(kw)) matches++;
      }
      if (matches > maxMatches) {
        maxMatches = matches;
        bestCat = cat;
      }
    }

    // Deterministic priority classification (returns word label: Low, Medium, High, Critical)
    const priorityResult = this.classifyPriority(bestCat, description, location);

    return {
      category: bestCat,
      priority: priorityResult.priority,
      priority_level: priorityResult.level,
      priority_rationale: priorityResult.rationale,
      is_safety_hazard: priorityResult.is_safety_hazard,
      potential_duplicates: []
    };
  }
};

window.SmartEngine = SmartEngine;

