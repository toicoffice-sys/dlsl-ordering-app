// ============================================================
// DLSL Ordering App — SeedData.js
// Run seedSampleData() once from the Apps Script editor
// ============================================================

/**
 * ▶ RUN THIS FIRST — one-time setup.
 * Sets the SPREADSHEET_ID in Script Properties so the app can
 * find its data spreadsheet. Run from Apps Script editor:
 * Extensions > Apps Script > select setupScriptProperties > Run
 */
function setupScriptProperties() {
  const props = PropertiesService.getScriptProperties();
  props.setProperty('SPREADSHEET_ID',  '1NzOjJQfDVdJLhy23oLB_upkLlxCuhiovHZPlscXfjDI');
  props.setProperty('PROOFS_FOLDER_ID','1mdH9Pa-k1OZB5ecRyF5bFvOrRrwxeJpM');
  Logger.log('✅ Script Properties set successfully.');
  Logger.log('SPREADSHEET_ID   = ' + props.getProperty('SPREADSHEET_ID'));
  Logger.log('PROOFS_FOLDER_ID = ' + props.getProperty('PROOFS_FOLDER_ID'));
}

/**
 * ▶ ONE-TIME MIGRATION — run from Apps Script editor to move all existing
 * proof files from "DLSL Ordering App — Payment Proofs" into the assigned
 * GreenBite/ProofOfPayment folder (PROOFS_FOLDER_ID).
 */
function runMigrateProofFiles() {
  const targetId     = PropertiesService.getScriptProperties().getProperty('PROOFS_FOLDER_ID');
  if (!targetId) { Logger.log('❌ PROOFS_FOLDER_ID not set. Run setupScriptProperties() first.'); return; }

  const targetFolder = DriveApp.getFolderById(targetId);
  Logger.log('Target folder: ' + targetFolder.getName() + ' (' + targetId + ')');

  let moved   = 0;
  let skipped = 0;
  const errors = [];

  // Move every file from the old named folder
  const oldIt = DriveApp.getFoldersByName('DLSL Ordering App — Payment Proofs');
  while (oldIt.hasNext()) {
    const oldFolder = oldIt.next();
    if (oldFolder.getId() === targetId) {
      Logger.log('⏭ Skipping — old folder IS the target folder.');
      continue;
    }
    Logger.log('Source folder: ' + oldFolder.getName() + ' (' + oldFolder.getId() + ')');
    const files = oldFolder.getFiles();
    while (files.hasNext()) {
      const file = files.next();
      try {
        targetFolder.addFile(file);
        oldFolder.removeFile(file);
        moved++;
        Logger.log('  ✅ Moved: ' + file.getName());
      } catch (e) {
        errors.push(file.getName() + ': ' + e.message);
        Logger.log('  ❌ Error: ' + file.getName() + ' — ' + e.message);
      }
    }
  }

  Logger.log('─────────────────────────────────');
  Logger.log('Done. Moved: ' + moved + ' | Skipped: ' + skipped + ' | Errors: ' + errors.length);
}

function seedSampleData() {
  seedUsers();
  seedConcessionaires();
  seedProducts();
  return 'Sample data seeded successfully!';
}

// ------------------------------------------------------------
// Sample Users
// ------------------------------------------------------------

function seedUsers() {
  const sheet = getSheet(SHEETS.USERS);
  const existing = sheet.getDataRange().getValues().slice(1).map(r => r[2]?.toLowerCase());

  const users = [
    ['USR-001', 'RESGO Admin',          'resgo@dlsl.edu.ph',           'admin',         'ADMIN-001', '09171234567', 'active'],
    ['USR-002', 'Maria Santos',         'maria.santos@dlsl.edu.ph',    'student',       '2021-0001',  '09181234567', 'active'],
    ['USR-003', 'Juan dela Cruz',       'juan.delacruz@dlsl.edu.ph',   'student',       '2022-0042',  '09191234567', 'active'],
    ['USR-004', 'Ana Reyes',            'ana.reyes@dlsl.edu.ph',       'student',       '2023-0015',  '09201234567', 'active'],
    ['USR-005', 'Pedro Lim',            'pedro.lim@dlsl.edu.ph',       'student',       '2021-0088',  '09171112233', 'active'],
    ['USR-006', 'Rosa Garcia',          'rosa.garcia@dlsl.edu.ph',     'parent',        '',           '09179998877', 'active'],
    ['USR-007', 'Mamang Cora',          'cora.canteen@dlsl.edu.ph',    'concessionaire','CONC-001',   '09175551234', 'active'],
    ['USR-008', 'Mang Noel',            'noel.grill@dlsl.edu.ph',      'concessionaire','CONC-002',   '09185551234', 'active'],
    ['USR-009', 'Ate Belen',            'belen.merienda@dlsl.edu.ph',  'concessionaire','CONC-003',   '09195551234', 'active'],
    ['USR-010', 'Kuya Rex',             'rex.rice@dlsl.edu.ph',        'concessionaire','CONC-004',   '09205551234', 'active'],
    ['USR-011', 'Aling Nena',           'nena.snacks@dlsl.edu.ph',     'concessionaire','CONC-005',   '09171115555', 'active'],
    ['USR-012', 'Chef Marco',           'marco.pasta@dlsl.edu.ph',     'concessionaire','CONC-006',   '09181116666', 'active'],
    ['USR-013', 'Ate Liza',             'liza.dimsum@dlsl.edu.ph',     'concessionaire','CONC-007',   '09191117777', 'active'],
    ['USR-014', 'Mang Romy',            'romy.bbq@dlsl.edu.ph',        'concessionaire','CONC-008',   '09201118888', 'active'],
    ['USR-015', 'Kuya Ben',             'ben.drinks@dlsl.edu.ph',      'concessionaire','CONC-009',   '09171119999', 'active'],
    ['USR-016', 'Ate Joy',              'joy.sweets@dlsl.edu.ph',      'concessionaire','CONC-010',   '09181110000', 'active'],
  ];

  const ts = new Date().toISOString();
  let added = 0;
  users.forEach(u => {
    if (!existing.includes(u[2].toLowerCase())) {
      sheet.appendRow([...u, ts]);
      added++;
    }
  });
  Logger.log(`Users: ${added} added.`);
}

// ------------------------------------------------------------
// Sample Concessionaires
// ------------------------------------------------------------

function seedConcessionaires() {
  const sheet = getSheet(SHEETS.CONCESSIONAIRES);
  const existing = sheet.getDataRange().getValues().slice(1).map(r => r[0]);

  const stalls = [
    {
      id: 'STL-001', email: 'cora.canteen@dlsl.edu.ph',
      name: 'Mamang Cora\'s Kitchen',
      location: 'Main Canteen, Ground Floor',
      desc: 'Home-cooked Filipino meals — rice, viand, soup. Always fresh!',
      hours: 'Mon–Fri 6:30 AM – 4:30 PM',
      rating: 4.8, ratings: 124,
      logo: 'https://img.icons8.com/emoji/96/pot-of-food.png'
    },
    {
      id: 'STL-002', email: 'noel.grill@dlsl.edu.ph',
      name: 'Noel\'s Grill & Silog',
      location: 'Main Canteen, Stall 2',
      desc: 'Best silog meals on campus. Tapsilog, Longsilog, Chicksilog.',
      hours: 'Mon–Fri 6:00 AM – 2:00 PM',
      rating: 4.6, ratings: 89,
      logo: 'https://img.icons8.com/emoji/96/cooking.png'
    },
    {
      id: 'STL-003', email: 'belen.merienda@dlsl.edu.ph',
      name: 'Ate Belen\'s Merienda',
      location: 'JHS Building, Lobby',
      desc: 'Kakanin, puto, kutsinta, biko, and other Filipino snacks.',
      hours: 'Mon–Sat 7:00 AM – 5:00 PM',
      rating: 4.5, ratings: 67,
      logo: 'https://img.icons8.com/emoji/96/rice-ball.png'
    },
    {
      id: 'STL-004', email: 'rex.rice@dlsl.edu.ph',
      name: 'Rex\'s Rice Bowl',
      location: 'SHS Building, Canteen',
      desc: 'Budget-friendly rice meals. Value for money para sa estudyante!',
      hours: 'Mon–Fri 7:00 AM – 5:00 PM',
      rating: 4.3, ratings: 101,
      logo: 'https://img.icons8.com/emoji/96/bento-box.png'
    },
    {
      id: 'STL-005', email: 'nena.snacks@dlsl.edu.ph',
      name: 'Aling Nena\'s Snack Bar',
      location: 'College Building, 1F',
      desc: 'Chips, biscuits, candies, instant noodles, and cold drinks.',
      hours: 'Mon–Sat 7:00 AM – 6:00 PM',
      rating: 4.2, ratings: 55,
      logo: 'https://img.icons8.com/emoji/96/popcorn.png'
    },
    {
      id: 'STL-006', email: 'marco.pasta@dlsl.edu.ph',
      name: 'Chef Marco\'s Pasta House',
      location: 'College Canteen, Stall 3',
      desc: 'Creamy carbonara, bolognese, pesto. Lasagna on Fridays!',
      hours: 'Mon–Fri 9:00 AM – 4:00 PM',
      rating: 4.7, ratings: 78,
      logo: 'https://img.icons8.com/emoji/96/spaghetti.png'
    },
    {
      id: 'STL-007', email: 'liza.dimsum@dlsl.edu.ph',
      name: 'Ate Liza\'s Dimsum Corner',
      location: 'Main Canteen, Stall 5',
      desc: 'Siomai, hakaw, spring rolls, bola-bola. Dipping sauce included!',
      hours: 'Mon–Fri 7:00 AM – 4:00 PM',
      rating: 4.6, ratings: 93,
      logo: 'https://img.icons8.com/emoji/96/dumpling.png'
    },
    {
      id: 'STL-008', email: 'romy.bbq@dlsl.edu.ph',
      name: 'Mang Romy\'s BBQ Stand',
      location: 'Near Covered Court',
      desc: 'Isaw, betamax, hotdog, pork barbeque. Grilled fresh daily.',
      hours: 'Mon–Fri 10:00 AM – 5:00 PM',
      rating: 4.9, ratings: 210,
      logo: 'https://img.icons8.com/emoji/96/meat-on-bone.png'
    },
    {
      id: 'STL-009', email: 'ben.drinks@dlsl.edu.ph',
      name: 'Kuya Ben\'s Drinks Station',
      location: 'Main Canteen, Drinks Area',
      desc: 'Fresh fruit shakes, milktea, iced coffee, gulaman, softdrinks.',
      hours: 'Mon–Sat 7:00 AM – 5:30 PM',
      rating: 4.4, ratings: 148,
      logo: 'https://img.icons8.com/emoji/96/bubble-tea.png'
    },
    {
      id: 'STL-010', email: 'joy.sweets@dlsl.edu.ph',
      name: 'Ate Joy\'s Sweet Corner',
      location: 'College Building, 2F',
      desc: 'Halo-halo, leche flan, banana cue, turon, and seasonal desserts.',
      hours: 'Mon–Fri 8:00 AM – 5:00 PM',
      rating: 4.8, ratings: 113,
      logo: 'https://img.icons8.com/emoji/96/shaved-ice.png'
    }
  ];

  const ts = new Date().toISOString();
  let added = 0;
  stalls.forEach(s => {
    if (!existing.includes(s.id)) {
      sheet.appendRow([
        s.id, s.email, s.name, s.location, s.desc,
        s.hours, 'active', s.rating, s.ratings, s.logo, 'approved', ts
      ]);
      added++;
    }
  });
  Logger.log(`Concessionaires: ${added} added.`);
}

// ------------------------------------------------------------
// Sample Products (menu items per stall)
// ------------------------------------------------------------

function seedProducts() {
  const sheet = getSheet(SHEETS.PRODUCTS);
  const existing = sheet.getDataRange().getValues().slice(1).map(r => r[0]);
  const ts = new Date().toISOString();
  let added = 0;

  const menus = [
    // STL-001 Mamang Cora's Kitchen
    { id:'PRD-001', stall:'STL-001', stname:"Mamang Cora's Kitchen", name:'Adobo Rice Meal',       cat:'Rice Meals', desc:'Classic pork adobo with steamed rice and soup.',               price:65,  stock:-1, img:'https://img.icons8.com/emoji/96/pot-of-food.png' },
    { id:'PRD-002', stall:'STL-001', stname:"Mamang Cora's Kitchen", name:'Sinigang na Baboy',     cat:'Soups',      desc:'Sour tamarind soup with pork and vegetables.',                price:75,  stock:-1, img:'https://img.icons8.com/emoji/96/pot-of-food.png' },
    { id:'PRD-003', stall:'STL-001', stname:"Mamang Cora's Kitchen", name:'Pinakbet Rice Meal',    cat:'Rice Meals', desc:'Pinakbet with bagoong, served with rice.',                    price:60,  stock:-1, img:'https://img.icons8.com/emoji/96/leafy-green.png' },
    { id:'PRD-004', stall:'STL-001', stname:"Mamang Cora's Kitchen", name:'Fried Chicken Meal',   cat:'Rice Meals', desc:'Crispy fried chicken with java rice and gravy.',             price:80,  stock:30, img:'https://img.icons8.com/emoji/96/fried-chicken.png' },
    { id:'PRD-005', stall:'STL-001', stname:"Mamang Cora's Kitchen", name:'Nilaga',                cat:'Soups',      desc:'Boiled beef with potato, pechay, and corn.',                 price:70,  stock:-1, img:'https://img.icons8.com/emoji/96/pot-of-food.png' },
    { id:'PRD-006', stall:'STL-001', stname:"Mamang Cora's Kitchen", name:'Plain Rice (add-on)',   cat:'Add-ons',    desc:'Extra steamed rice.',                                        price:15,  stock:-1, img:'https://img.icons8.com/emoji/96/rice.png' },

    // STL-002 Noel's Grill & Silog
    { id:'PRD-007', stall:'STL-002', stname:"Noel's Grill & Silog",  name:'Tapsilog',              cat:'Silog',      desc:'Beef tapa, garlic rice, and sunny-side-up egg.',             price:85,  stock:-1, img:'https://img.icons8.com/emoji/96/cooking.png' },
    { id:'PRD-008', stall:'STL-002', stname:"Noel's Grill & Silog",  name:'Longsilog',             cat:'Silog',      desc:'Longganisa sausage, garlic rice, and egg.',                  price:80,  stock:-1, img:'https://img.icons8.com/emoji/96/cooking.png' },
    { id:'PRD-009', stall:'STL-002', stname:"Noel's Grill & Silog",  name:'Chicksilog',            cat:'Silog',      desc:'Fried chicken, garlic rice, and egg.',                       price:85,  stock:-1, img:'https://img.icons8.com/emoji/96/fried-chicken.png' },
    { id:'PRD-010', stall:'STL-002', stname:"Noel's Grill & Silog",  name:'Bangsilog',             cat:'Silog',      desc:'Grilled bangus, garlic rice, and egg.',                      price:90,  stock:20, img:'https://img.icons8.com/emoji/96/cooking.png' },
    { id:'PRD-011', stall:'STL-002', stname:"Noel's Grill & Silog",  name:'Daing na Bangus',       cat:'Rice Meals', desc:'Marinated milkfish fried crispy, with garlic rice.',         price:95,  stock:15, img:'https://img.icons8.com/emoji/96/cooking.png' },
    { id:'PRD-012', stall:'STL-002', stname:"Noel's Grill & Silog",  name:'Hotsilog',              cat:'Silog',      desc:'Hotdog, garlic rice, and egg. Kids\' favorite!',            price:60,  stock:-1, img:'https://img.icons8.com/emoji/96/cooking.png' },

    // STL-003 Ate Belen's Merienda
    { id:'PRD-013', stall:'STL-003', stname:"Ate Belen's Merienda",  name:'Puto (6 pcs)',          cat:'Kakanin',    desc:'Soft steamed rice cakes, plain or with cheese.',             price:35,  stock:50, img:'https://img.icons8.com/emoji/96/rice-ball.png' },
    { id:'PRD-014', stall:'STL-003', stname:"Ate Belen's Merienda",  name:'Kutsinta (6 pcs)',      cat:'Kakanin',    desc:'Sticky brown rice cakes with grated coconut.',               price:30,  stock:40, img:'https://img.icons8.com/emoji/96/rice-ball.png' },
    { id:'PRD-015', stall:'STL-003', stname:"Ate Belen's Merienda",  name:'Biko',                  cat:'Kakanin',    desc:'Sweet sticky rice with coconut milk and latik.',             price:40,  stock:30, img:'https://img.icons8.com/emoji/96/rice-ball.png' },
    { id:'PRD-016', stall:'STL-003', stname:"Ate Belen's Merienda",  name:'Palitaw (3 pcs)',       cat:'Kakanin',    desc:'Chewy rice cakes with sesame and coconut.',                  price:30,  stock:35, img:'https://img.icons8.com/emoji/96/rice-ball.png' },
    { id:'PRD-017', stall:'STL-003', stname:"Ate Belen's Merienda",  name:'Maja Blanca',           cat:'Kakanin',    desc:'Creamy coconut milk pudding with corn.',                     price:35,  stock:25, img:'https://img.icons8.com/emoji/96/custard.png' },
    { id:'PRD-018', stall:'STL-003', stname:"Ate Belen's Merienda",  name:'Champorado',            cat:'Hot Drinks',  desc:'Chocolate rice porridge, best with tuyo.',                  price:40,  stock:-1, img:'https://img.icons8.com/emoji/96/hot-beverage.png' },

    // STL-004 Rex's Rice Bowl
    { id:'PRD-019', stall:'STL-004', stname:"Rex's Rice Bowl",       name:'Pork Menudo Meal',      cat:'Rice Meals', desc:'Pork menudo with carrots, potatoes, and rice.',              price:55,  stock:-1, img:'https://img.icons8.com/emoji/96/bento-box.png' },
    { id:'PRD-020', stall:'STL-004', stname:"Rex's Rice Bowl",       name:'Beef Kaldereta Meal',   cat:'Rice Meals', desc:'Slow-cooked beef caldereta with rice.',                      price:70,  stock:-1, img:'https://img.icons8.com/emoji/96/bento-box.png' },
    { id:'PRD-021', stall:'STL-004', stname:"Rex's Rice Bowl",       name:'Pakbet Meal',           cat:'Rice Meals', desc:'Mixed vegetables with bagnet and bagoong.',                  price:50,  stock:-1, img:'https://img.icons8.com/emoji/96/leafy-green.png' },
    { id:'PRD-022', stall:'STL-004', stname:"Rex's Rice Bowl",       name:'Pork Kinamatisan',      cat:'Rice Meals', desc:'Pork in tomato sauce with rice.',                            price:55,  stock:-1, img:'https://img.icons8.com/emoji/96/bento-box.png' },
    { id:'PRD-023', stall:'STL-004', stname:"Rex's Rice Bowl",       name:'Budget Meal',           cat:'Value Meals', desc:'Rice + 1 viand + soup. Best value!',                       price:45,  stock:-1, img:'https://img.icons8.com/emoji/96/bento-box.png' },

    // STL-005 Aling Nena's Snack Bar
    { id:'PRD-024', stall:'STL-005', stname:"Aling Nena's Snack Bar",name:'Cup Noodles (regular)', cat:'Instant',    desc:'Nissin cup noodles, various flavors.',                       price:35,  stock:100, img:'https://img.icons8.com/emoji/96/steaming-bowl.png' },
    { id:'PRD-025', stall:'STL-005', stname:"Aling Nena's Snack Bar",name:'Chippy / Nova',         cat:'Chips',      desc:'Assorted chips snacks.',                                     price:20,  stock:80,  img:'https://img.icons8.com/emoji/96/popcorn.png' },
    { id:'PRD-026', stall:'STL-005', stname:"Aling Nena's Snack Bar",name:'Skyflakes (pack)',      cat:'Biscuits',   desc:'Classic Filipino crackers.',                                 price:15,  stock:60,  img:'https://img.icons8.com/emoji/96/cookie.png' },
    { id:'PRD-027', stall:'STL-005', stname:"Aling Nena's Snack Bar",name:'Bottled Water',         cat:'Drinks',     desc:'500ml purified drinking water.',                             price:20,  stock:200, img:'https://img.icons8.com/emoji/96/droplet.png' },
    { id:'PRD-028', stall:'STL-005', stname:"Aling Nena's Snack Bar",name:'Softdrinks (can)',      cat:'Drinks',     desc:'Coke, Royal, Sprite — cold.',                                price:35,  stock:50,  img:'https://img.icons8.com/emoji/96/beverage-straw.png' },

    // STL-006 Chef Marco's Pasta House
    { id:'PRD-029', stall:'STL-006', stname:"Chef Marco's Pasta House",name:'Carbonara',           cat:'Pasta',      desc:'Creamy white sauce pasta with bacon bits.',                  price:85,  stock:30, img:'https://img.icons8.com/emoji/96/spaghetti.png' },
    { id:'PRD-030', stall:'STL-006', stname:"Chef Marco's Pasta House",name:'Bolognese',           cat:'Pasta',      desc:'Classic meat sauce spaghetti.',                              price:80,  stock:30, img:'https://img.icons8.com/emoji/96/spaghetti.png' },
    { id:'PRD-031', stall:'STL-006', stname:"Chef Marco's Pasta House",name:'Pesto Pasta',         cat:'Pasta',      desc:'Basil pesto with parmesan and pine nuts.',                   price:90,  stock:20, img:'https://img.icons8.com/emoji/96/spaghetti.png' },
    { id:'PRD-032', stall:'STL-006', stname:"Chef Marco's Pasta House",name:'Baked Macaroni',      cat:'Pasta',      desc:'Macaroni baked with meat sauce and cheese.',                 price:95,  stock:15, img:'https://img.icons8.com/emoji/96/spaghetti.png' },
    { id:'PRD-033', stall:'STL-006', stname:"Chef Marco's Pasta House",name:'Lasagna (slice)',     cat:'Pasta',      desc:'Layers of pasta, meat, and béchamel. Fridays only.',         price:110, stock:10, img:'https://img.icons8.com/emoji/96/spaghetti.png' },
    { id:'PRD-034', stall:'STL-006', stname:"Chef Marco's Pasta House",name:'Garlic Bread (2 pcs)',cat:'Sides',      desc:'Toasted garlic bread with butter.',                          price:30,  stock:40, img:'https://img.icons8.com/emoji/96/baguette-bread.png' },

    // STL-007 Ate Liza's Dimsum Corner
    { id:'PRD-035', stall:'STL-007', stname:"Ate Liza's Dimsum Corner",name:'Siomai (5 pcs)',      cat:'Dimsum',     desc:'Pork and shrimp siomai with soy-calamansi dip.',            price:50,  stock:-1, img:'https://img.icons8.com/emoji/96/dumpling.png' },
    { id:'PRD-036', stall:'STL-007', stname:"Ate Liza's Dimsum Corner",name:'Hakaw (4 pcs)',       cat:'Dimsum',     desc:'Steamed shrimp dumplings.',                                  price:60,  stock:40, img:'https://img.icons8.com/emoji/96/dumpling.png' },
    { id:'PRD-037', stall:'STL-007', stname:"Ate Liza's Dimsum Corner",name:'Lumpiang Shanghai',  cat:'Dimsum',     desc:'Crispy mini spring rolls with sweet-sour sauce.',            price:45,  stock:-1, img:'https://img.icons8.com/emoji/96/spring-roll.png' },
    { id:'PRD-038', stall:'STL-007', stname:"Ate Liza's Dimsum Corner",name:'Bola-bola (5 pcs)',  cat:'Dimsum',     desc:'Fried fishballs in sweet sauce.',                            price:35,  stock:-1, img:'https://img.icons8.com/emoji/96/dumpling.png' },
    { id:'PRD-039', stall:'STL-007', stname:"Ate Liza's Dimsum Corner",name:'Congee (Arroz Caldo)',cat:'Rice',      desc:'Chicken rice porridge with egg and chicharon.',              price:55,  stock:30, img:'https://img.icons8.com/emoji/96/steaming-bowl.png' },

    // STL-008 Mang Romy's BBQ Stand
    { id:'PRD-040', stall:'STL-008', stname:"Mang Romy's BBQ Stand",  name:'Pork BBQ (stick)',     cat:'BBQ',        desc:'Marinated pork skewer, grilled charcoal style.',             price:25,  stock:-1, img:'https://img.icons8.com/emoji/96/meat-on-bone.png' },
    { id:'PRD-041', stall:'STL-008', stname:"Mang Romy's BBQ Stand",  name:'Isaw (stick)',         cat:'BBQ',        desc:'Grilled chicken intestines with vinegar dip.',               price:15,  stock:-1, img:'https://img.icons8.com/emoji/96/meat-on-bone.png' },
    { id:'PRD-042', stall:'STL-008', stname:"Mang Romy's BBQ Stand",  name:'Hotdog (stick)',       cat:'BBQ',        desc:'Grilled jumbo hotdog on a stick.',                           price:20,  stock:-1, img:'https://img.icons8.com/emoji/96/hot-dog.png' },
    { id:'PRD-043', stall:'STL-008', stname:"Mang Romy's BBQ Stand",  name:'Chicken Skin (bag)',   cat:'BBQ',        desc:'Crispy deep-fried chicken skin, lightly salted.',            price:30,  stock:50, img:'https://img.icons8.com/emoji/96/poultry-leg.png' },
    { id:'PRD-044', stall:'STL-008', stname:"Mang Romy's BBQ Stand",  name:'Betamax (stick)',      cat:'BBQ',        desc:'Grilled coagulated chicken blood. Classic street food!',     price:15,  stock:-1, img:'https://img.icons8.com/emoji/96/meat-on-bone.png' },
    { id:'PRD-045', stall:'STL-008', stname:"Mang Romy's BBQ Stand",  name:'BBQ Meal (3 sticks+rice)',cat:'Meals',  desc:'3 pork BBQ sticks with garlic rice.',                       price:90,  stock:-1, img:'https://img.icons8.com/emoji/96/bento-box.png' },

    // STL-009 Kuya Ben's Drinks Station
    { id:'PRD-046', stall:'STL-009', stname:"Kuya Ben's Drinks Station",name:'Milktea (medium)',   cat:'Milktea',    desc:'Classic milk tea with tapioca pearls. Choice of flavor.',   price:65,  stock:-1, img:'https://img.icons8.com/emoji/96/bubble-tea.png' },
    { id:'PRD-047', stall:'STL-009', stname:"Kuya Ben's Drinks Station",name:'Milktea (large)',    cat:'Milktea',    desc:'Large milk tea with extra pearls.',                          price:79,  stock:-1, img:'https://img.icons8.com/emoji/96/bubble-tea.png' },
    { id:'PRD-048', stall:'STL-009', stname:"Kuya Ben's Drinks Station",name:'Iced Coffee',        cat:'Coffee',     desc:'House blend iced coffee, creamy and sweet.',                 price:55,  stock:-1, img:'https://img.icons8.com/emoji/96/hot-beverage.png' },
    { id:'PRD-049', stall:'STL-009', stname:"Kuya Ben's Drinks Station",name:'Fruit Shake',        cat:'Shakes',     desc:'Fresh blended fruits — mango, avocado, or mixed.',          price:60,  stock:-1, img:'https://img.icons8.com/emoji/96/tropical-drink.png' },
    { id:'PRD-050', stall:'STL-009', stname:"Kuya Ben's Drinks Station",name:'Gulaman',            cat:'Drinks',     desc:'Samalamig na gulaman, cold and sweet.',                     price:20,  stock:-1, img:'https://img.icons8.com/emoji/96/cup-with-straw.png' },
    { id:'PRD-051', stall:'STL-009', stname:"Kuya Ben's Drinks Station",name:'Sago\'t Gulaman',    cat:'Drinks',     desc:'Classic Filipino sago at gulaman cold drink.',               price:25,  stock:-1, img:'https://img.icons8.com/emoji/96/cup-with-straw.png' },

    // STL-010 Ate Joy's Sweet Corner
    { id:'PRD-052', stall:'STL-010', stname:"Ate Joy's Sweet Corner", name:'Halo-halo',            cat:'Desserts',   desc:'Filipino shaved ice dessert with ube, leche flan, and more.',price:75, stock:30, img:'https://img.icons8.com/emoji/96/shaved-ice.png' },
    { id:'PRD-053', stall:'STL-010', stname:"Ate Joy's Sweet Corner", name:'Leche Flan',           cat:'Desserts',   desc:'Classic caramel custard, silky smooth.',                    price:55,  stock:20, img:'https://img.icons8.com/emoji/96/custard.png' },
    { id:'PRD-054', stall:'STL-010', stname:"Ate Joy's Sweet Corner", name:'Banana Cue (3 pcs)',   cat:'Merienda',   desc:'Caramelized banana on a stick.',                            price:25,  stock:-1, img:'https://img.icons8.com/emoji/96/banana.png' },
    { id:'PRD-055', stall:'STL-010', stname:"Ate Joy's Sweet Corner", name:'Turon (2 pcs)',        cat:'Merienda',   desc:'Crispy banana spring rolls with langka.',                   price:25,  stock:-1, img:'https://img.icons8.com/emoji/96/spring-roll.png' },
    { id:'PRD-056', stall:'STL-010', stname:"Ate Joy's Sweet Corner", name:'Mais con Yelo',        cat:'Desserts',   desc:'Sweet corn with shaved ice and evaporated milk.',           price:45,  stock:25, img:'https://img.icons8.com/emoji/96/shaved-ice.png' },
    { id:'PRD-057', stall:'STL-010', stname:"Ate Joy's Sweet Corner", name:'Pichi-pichi (5 pcs)',  cat:'Kakanin',    desc:'Soft cassava balls rolled in desiccated coconut.',          price:30,  stock:35, img:'https://img.icons8.com/emoji/96/rice-ball.png' },
  ];

  menus.forEach(p => {
    if (!existing.includes(p.id)) {
      sheet.appendRow([
        p.id, p.stall, p.stname, p.name, p.cat, p.desc,
        p.price, p.stock, p.img, true, 'approved', ts
      ]);
      added++;
    }
  });
  Logger.log(`Products: ${added} added.`);
}
