export const SUPPORTED_LANGUAGES = ['es', 'en', 'pt-BR', 'zh-CN'];

export const LANGUAGE_LABELS = {
    es: 'ES',
    en: 'EN',
    'pt-BR': 'PT',
    'zh-CN': '中文'
};

export const LANGUAGE_NAMES = {
    es: 'Español',
    en: 'English',
    'pt-BR': 'Português',
    'zh-CN': '中文'
};

const STORAGE_KEY = 'microwars_language';
const DEFAULT_LANGUAGE = 'es';

const TRANSLATIONS = {
    es: {
        'menu.title': 'MicroWars',
        'menu.subtitle': 'Tácticas de Enjambre',
        'menu.campaign': 'MODO CAMPAÑA',
        'menu.play': 'JUGAR',
        'menu.missions': 'MISIONES (NIVELES)',
        'menu.credits': 'CRÉDITOS',
        'menu.download': 'DESCARGA',
        'menu.downloadSoon': 'Próximamente en itch.io',
        'menu.downloadReady': 'Disponible en itch.io',
        'language.label': 'Idioma',
        'credits.title': 'Créditos',
        'credits.greeting': 'Hola, jugador. Gracias por jugar MicroWars: Swarm Tactics.',
        'credits.creator': 'Creado por Quilik.',
        'credits.contactLabel': 'Contacto',
        'credits.close': 'Cerrar',
        'screen.levelSelect': 'SELECCIONAR ESCARAMUZA',
        'screen.factionSelect': 'ELIGE TU ENJAMBRE',
        'screen.campaignMap': 'MAPA ESTRATÉGICO',
        'nav.backMenu': 'VOLVER AL MENÚ',
        'nav.backSector': 'VOLVER AL SECTOR',
        'nav.nextLevel': 'SIGUIENTE NIVEL',
        'nav.retry': 'REINTENTAR',
        'nav.backSectorsView': '← VISTA DE SECTORES',
        'difficulty.label': 'Dificultad de la IA:',
        'difficulty.easy': 'FÁCIL',
        'difficulty.normal': 'NORMAL',
        'difficulty.hard': 'DIFÍCIL',
        'difficulty.easyTitle': 'La IA comete errores, ataca lento y rara vez coordina.',
        'difficulty.normalTitle': 'Comportamiento equilibrado. La IA expande, evoluciona y ataca con ritmo normal.',
        'difficulty.hardTitle': 'La IA actúa rápido, coordina flancos y hace rush temprano.',
        'difficulty.easyDesc': 'Conciencia estratégica: planifica rutas, refuerza momentum y evita sobreextensión.',
        'difficulty.normalDesc': 'Inteligencia enjambre: coordinación de pinzas, ataques precisos y sniping oportunista.',
        'difficulty.hardDesc': 'Dominio absoluto: back-capping, flanqueos letales, conciencia de peligros del mapa.',
        'intro.defaultTitle': 'SECTOR {sector} - NIVEL {level}',
        'intro.defaultDesc': 'Acaba con el nido enemigo.',
        'intro.continue': '(Haz clic en cualquier lado para continuar)',
        'victory.title': '¡VICTORIA!',
        'victory.subtitle': 'El territorio es nuestro',
        'gameover.title': 'LA COLONIA HA CAÍDO',
        'gameover.subtitle': 'Nuestros números no fueron suficientes',
        'hud.send': 'Enviar',
        'hud.zoomOut': '- Zoom',
        'hud.zoomIn': '+ Zoom',
        'hud.restart': '🔄 Reiniciar',
        'hud.surrender': 'RETIRADA AL SECTOR',
        'pause.pause': '⏸ PAUSA',
        'pause.resume': '▶ REANUDAR',
        'sector.levelsBadge': '{count} REDES IDENTIFICADAS',
        'tooltip.noEvolution': 'Sin evolución',
        'tooltip.owner': 'Dueño',
        'tooltip.limit': 'Límite',
        'evolution.thorn': 'Tronco Espinoso (30)',
        'evolution.artillery': 'Artillería (40)',
        'evolution.tank': 'Tanques (50)',
        'evolution.cancel': 'Cancelar',
        'alert.premiumFaction': '¡Esta facción es exclusiva de la versión Premium!',
        'alert.gameBeaten': '¡FELICIDADES COMANDANTE!\n\nHas conquistado todos los sectores, doblegado a las especies rivales y asegurado la supervivencia absoluta de tu colonia.\n\nEl enjambre perdurará gracias a tus increíbles tácticas.\n\n¡Gracias por jugar MicroWars Tactics!'
    },
    en: {
        'menu.title': 'MicroWars',
        'menu.subtitle': 'Swarm Tactics',
        'menu.campaign': 'CAMPAIGN MODE',
        'menu.play': 'PLAY',
        'menu.missions': 'MISSIONS (LEVELS)',
        'menu.credits': 'CREDITS',
        'menu.download': 'DOWNLOAD',
        'menu.downloadSoon': 'Coming soon on itch.io',
        'menu.downloadReady': 'Available on itch.io',
        'language.label': 'Language',
        'credits.title': 'Credits',
        'credits.greeting': 'Hello, player. Thank you for playing MicroWars: Swarm Tactics.',
        'credits.creator': 'Created by Quilik.',
        'credits.contactLabel': 'Contact',
        'credits.close': 'Close',
        'screen.levelSelect': 'SELECT SKIRMISH',
        'screen.factionSelect': 'CHOOSE YOUR SWARM',
        'screen.campaignMap': 'STRATEGIC MAP',
        'nav.backMenu': 'BACK TO MENU',
        'nav.backSector': 'BACK TO SECTOR',
        'nav.nextLevel': 'NEXT LEVEL',
        'nav.retry': 'RETRY',
        'nav.backSectorsView': '← SECTOR VIEW',
        'difficulty.label': 'AI Difficulty:',
        'difficulty.easy': 'EASY',
        'difficulty.normal': 'NORMAL',
        'difficulty.hard': 'HARD',
        'difficulty.easyTitle': 'The AI makes mistakes, attacks slowly, and rarely coordinates.',
        'difficulty.normalTitle': 'Balanced behavior. The AI expands, evolves, and attacks at a steady pace.',
        'difficulty.hardTitle': 'The AI acts fast, coordinates flanks, and rushes early.',
        'difficulty.easyDesc': 'Strategic awareness: plans routes, reinforces momentum, and avoids overextension.',
        'difficulty.normalDesc': 'Swarm intelligence: pincer coordination, precise attacks, and opportunistic sniping.',
        'difficulty.hardDesc': 'Total dominance: back-capping, lethal flanks, and hazard awareness.',
        'intro.defaultTitle': 'SECTOR {sector} - LEVEL {level}',
        'intro.defaultDesc': 'Eliminate the enemy nest.',
        'intro.continue': '(Click anywhere to continue)',
        'victory.title': 'VICTORY!',
        'victory.subtitle': 'The territory is ours',
        'gameover.title': 'THE COLONY HAS FALLEN',
        'gameover.subtitle': 'Our numbers were not enough',
        'hud.send': 'Send',
        'hud.zoomOut': '- Zoom',
        'hud.zoomIn': '+ Zoom',
        'hud.restart': '🔄 Restart',
        'hud.surrender': 'RETREAT TO SECTOR',
        'pause.pause': '⏸ PAUSE',
        'pause.resume': '▶ RESUME',
        'sector.levelsBadge': '{count} NETWORKS IDENTIFIED',
        'tooltip.noEvolution': 'No evolution',
        'tooltip.owner': 'Owner',
        'tooltip.limit': 'Limit',
        'evolution.thorn': 'Thorn Trunk (30)',
        'evolution.artillery': 'Artillery (40)',
        'evolution.tank': 'Tanks (50)',
        'evolution.cancel': 'Cancel',
        'alert.premiumFaction': 'This faction is exclusive to the Premium version!',
        'alert.gameBeaten': 'CONGRATULATIONS, COMMANDER!\n\nYou have conquered every sector, subdued the rival species, and secured the absolute survival of your colony.\n\nThe swarm will endure thanks to your incredible tactics.\n\nThank you for playing MicroWars Tactics!'
    },
    'pt-BR': {
        'menu.title': 'MicroWars',
        'menu.subtitle': 'Táticas de Enxame',
        'menu.campaign': 'MODO CAMPANHA',
        'menu.play': 'JOGAR',
        'menu.missions': 'MISSÕES (NÍVEIS)',
        'menu.credits': 'CRÉDITOS',
        'menu.download': 'BAIXAR',
        'menu.downloadSoon': 'Em breve no itch.io',
        'menu.downloadReady': 'Disponivel no itch.io',
        'language.label': 'Idioma',
        'credits.title': 'Créditos',
        'credits.greeting': 'Olá, jogador. Obrigado por jogar MicroWars: Swarm Tactics.',
        'credits.creator': 'Criado por Quilik.',
        'credits.contactLabel': 'Contato',
        'credits.close': 'Fechar',
        'screen.levelSelect': 'SELECIONAR ESCARAMUÇA',
        'screen.factionSelect': 'ESCOLHA SEU ENXAME',
        'screen.campaignMap': 'MAPA ESTRATÉGICO',
        'nav.backMenu': 'VOLTAR AO MENU',
        'nav.backSector': 'VOLTAR AO SETOR',
        'nav.nextLevel': 'PRÓXIMO NÍVEL',
        'nav.retry': 'TENTAR NOVAMENTE',
        'nav.backSectorsView': '← VISÃO DOS SETORES',
        'difficulty.label': 'Dificuldade da IA:',
        'difficulty.easy': 'FÁCIL',
        'difficulty.normal': 'NORMAL',
        'difficulty.hard': 'DIFÍCIL',
        'difficulty.easyTitle': 'A IA comete erros, ataca devagar e raramente coordena.',
        'difficulty.normalTitle': 'Comportamento equilibrado. A IA expande, evolui e ataca em ritmo normal.',
        'difficulty.hardTitle': 'A IA age rápido, coordena flancos e faz rush cedo.',
        'difficulty.easyDesc': 'Consciência estratégica: planeja rotas, reforça o ritmo e evita se estender demais.',
        'difficulty.normalDesc': 'Inteligência de enxame: coordenação de pinças, ataques precisos e sniping oportunista.',
        'difficulty.hardDesc': 'Domínio absoluto: back-capping, flancos letais e consciência dos perigos do mapa.',
        'intro.defaultTitle': 'SETOR {sector} - NÍVEL {level}',
        'intro.defaultDesc': 'Elimine o ninho inimigo.',
        'intro.continue': '(Clique em qualquer lugar para continuar)',
        'victory.title': 'VITÓRIA!',
        'victory.subtitle': 'O território é nosso',
        'gameover.title': 'A COLÔNIA CAIU',
        'gameover.subtitle': 'Nossos números não foram suficientes',
        'hud.send': 'Enviar',
        'hud.zoomOut': '- Zoom',
        'hud.zoomIn': '+ Zoom',
        'hud.restart': '🔄 Reiniciar',
        'hud.surrender': 'RETIRADA PARA O SETOR',
        'pause.pause': '⏸ PAUSA',
        'pause.resume': '▶ RETOMAR',
        'sector.levelsBadge': '{count} REDES IDENTIFICADAS',
        'tooltip.noEvolution': 'Sem evolução',
        'tooltip.owner': 'Dono',
        'tooltip.limit': 'Limite',
        'evolution.thorn': 'Tronco Espinhoso (30)',
        'evolution.artillery': 'Artilharia (40)',
        'evolution.tank': 'Tanques (50)',
        'evolution.cancel': 'Cancelar',
        'alert.premiumFaction': 'Esta facção é exclusiva da versão Premium!',
        'alert.gameBeaten': 'PARABÉNS, COMANDANTE!\n\nVocê conquistou todos os setores, dominou as espécies rivais e garantiu a sobrevivência absoluta da sua colônia.\n\nO enxame vai perdurar graças às suas táticas incríveis.\n\nObrigado por jogar MicroWars Tactics!'
    },
    'zh-CN': {
        'menu.title': 'MicroWars',
        'menu.subtitle': '虫群战术',
        'menu.campaign': '战役模式',
        'menu.play': '开始游戏',
        'menu.missions': '任务（关卡）',
        'menu.credits': '制作人员',
        'menu.download': '下载',
        'menu.downloadSoon': '即将在 itch.io 发布',
        'menu.downloadReady': '已在 itch.io 发布',
        'language.label': '语言',
        'credits.title': '制作人员',
        'credits.greeting': '你好，玩家。感谢你游玩 MicroWars: Swarm Tactics。',
        'credits.creator': '由 Quilik 制作。',
        'credits.contactLabel': '联系邮箱',
        'credits.close': '关闭',
        'screen.levelSelect': '选择遭遇战',
        'screen.factionSelect': '选择你的虫群',
        'screen.campaignMap': '战略地图',
        'nav.backMenu': '返回菜单',
        'nav.backSector': '返回区域',
        'nav.nextLevel': '下一关',
        'nav.retry': '重试',
        'nav.backSectorsView': '← 区域视图',
        'difficulty.label': 'AI 难度：',
        'difficulty.easy': '简单',
        'difficulty.normal': '普通',
        'difficulty.hard': '困难',
        'difficulty.easyTitle': 'AI 会犯错，进攻较慢，也很少协同。',
        'difficulty.normalTitle': '均衡行为。AI 会扩张、进化，并以正常节奏进攻。',
        'difficulty.hardTitle': 'AI 行动迅速，会协同侧翼并早期快攻。',
        'difficulty.easyDesc': '战略意识：规划路线、巩固优势，并避免过度扩张。',
        'difficulty.normalDesc': '虫群智能：夹击协同、精准进攻和机会性狙击。',
        'difficulty.hardDesc': '绝对压制：后方夺点、致命侧翼和地图危险意识。',
        'intro.defaultTitle': '区域 {sector} - 关卡 {level}',
        'intro.defaultDesc': '消灭敌方巢穴。',
        'intro.continue': '（点击任意位置继续）',
        'victory.title': '胜利！',
        'victory.subtitle': '领地属于我们',
        'gameover.title': '殖群已覆灭',
        'gameover.subtitle': '我们的数量还不够',
        'hud.send': '派出',
        'hud.zoomOut': '- 缩放',
        'hud.zoomIn': '+ 缩放',
        'hud.restart': '🔄 重新开始',
        'hud.surrender': '撤回区域',
        'pause.pause': '⏸ 暂停',
        'pause.resume': '▶ 继续',
        'sector.levelsBadge': '已识别 {count} 个网络',
        'tooltip.noEvolution': '未进化',
        'tooltip.owner': '归属',
        'tooltip.limit': '上限',
        'evolution.thorn': '荆刺树干 (30)',
        'evolution.artillery': '火炮 (40)',
        'evolution.tank': '坦克 (50)',
        'evolution.cancel': '取消',
        'alert.premiumFaction': '该阵营为高级版专属！',
        'alert.gameBeaten': '恭喜，指挥官！\n\n你已经征服所有区域，击败敌对物种，并确保了殖群的绝对生存。\n\n凭借你出色的战术，虫群将延续下去。\n\n感谢你游玩 MicroWars Tactics！'
    }
};

let currentLanguage = loadLanguage();

function normalizeLanguage(language) {
    return SUPPORTED_LANGUAGES.includes(language) ? language : DEFAULT_LANGUAGE;
}

export function loadLanguage() {
    try {
        return normalizeLanguage(localStorage.getItem(STORAGE_KEY));
    } catch (e) {
        return DEFAULT_LANGUAGE;
    }
}

export function getLanguage() {
    return currentLanguage;
}

export function setLanguage(language) {
    currentLanguage = normalizeLanguage(language);
    try {
        localStorage.setItem(STORAGE_KEY, currentLanguage);
    } catch (e) {}
    return currentLanguage;
}

export function t(key, language = currentLanguage) {
    const table = TRANSLATIONS[normalizeLanguage(language)] || TRANSLATIONS[DEFAULT_LANGUAGE];
    return table[key] || TRANSLATIONS[DEFAULT_LANGUAGE][key] || key;
}

export function tf(key, values = {}, language = currentLanguage) {
    return t(key, language).replace(/\{(\w+)\}/g, (match, name) => {
        return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : match;
    });
}

export function applyTranslations(root = document) {
    root.querySelectorAll('[data-i18n]').forEach((el) => {
        el.textContent = t(el.dataset.i18n);
    });

    root.querySelectorAll('[data-i18n-title]').forEach((el) => {
        el.setAttribute('title', t(el.dataset.i18nTitle));
    });

    document.documentElement.lang = currentLanguage;
}
