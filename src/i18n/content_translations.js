import { getLanguage } from './translations.js';

const CONTENT = {
    en: {
        sectors: {
            1: { name: 'Sector 1: The Awakening', description: 'Fundamentals, pure mobility, and establishing logistic paths. Learn to master the swarm. Upgrades disabled.' },
            2: { name: 'Sector 2: Underground Networks', description: 'Master tunnels, logistics, and tactical evolutions. Artillery, thorns, and tanks begin shaping every puzzle.' },
            3: { name: 'Sector 3: Containment Zones', description: 'Insecticide kills on contact. Ferries, tunnels, and safe routes matter as much as brute force.' },
            4: { name: 'Sector 4: Viscous Terrain', description: 'Master friction, mud, and fast lanes. Terrain speed completely changes the flow of combat.' },
            5: { name: 'Sector 5: Relentless Tides', description: 'Water sweeps away everything in its path. Direction, cadence, and timing are the key to survival.' },
            6: { name: 'Sector 6: Dynamic Barriers', description: 'Intermittent gates, pulsing cells, and solar sweeps turn every advance into a synchronization test.' }
        },
        levels: {
            1: { name: 'Level 1: Learn to Conquer', description: '1. Click your blue base.\n2. Set the troop send bar to 100%.\n3. Click the enemy node to attack it.' },
            2: { name: 'Level 2: Resource Dispute', description: 'Secure the swarm nodes in the center before the enemy does.' },
            3: { name: 'Level 3: The Central Moat', description: 'We are surrounded. Survive two fronts at the same time.' },
            4: { name: 'Level 4: The Crystal Fortress', description: 'A blue force wall encloses the enemy nest on three sides.\nAnts cannot cross the wall and will pile up at its edge.\nThe central mobile ferry moves up and down through the lower wall.\nLoad your troops onto the ferry to infiltrate and attack from within.' },
            5: { name: 'Level 5: The Impassable Wall', description: 'An absolute blockade prevents direct passage between your lower-left nest and the enemy.\nYou must go around the enormous crystal structure by conquering the upper nodes to flank.' },
            6: { name: 'Level 6: Underground Connections', description: 'A huge diagonal barrier completely divides the map. The only way to advance and siege the far side is by using the deep tunnel. Careful: the orange faction is present on both fronts.' },
            7: { name: 'Level 7: The Artillery Bastion', description: 'The enemy is entrenched on the far side of the strait. Gather your troops and secure the central nodes to break through.' },
            8: { name: 'Level 8: Thorny Chokepoint', description: 'The map is an hourglass with a single central neck.\nIf you turn that node thorny, you can stop entire waves while preparing the counterattack.' },
            9: { name: 'Level 9: Duel of Titans', description: 'There are few nodes, and all of them are giants.\nMass production and tank evolution will decide who survives the war of attrition.' },
            10: { name: 'Level 10: The Floating Leaf', description: 'The center is blocked by a lethal insecticide puddle. Use the mobile floating leaf to cross safely without losing troops.' },
            11: { name: 'Level 11: Eye of the Storm', description: 'A thick ring of insecticide protects the core of the map.\nUse the orbital ferry to cross safely, or force your way through while accepting losses.' },
            12: { name: 'Level 12: Safety Islands', description: 'The whole map is a sea of insecticide. Only small safe islands around each node let you regroup.\nYou must send troops with surgical precision from island to island.' },
            13: { name: 'Level 13: Poison Rivers', description: 'Three rivers of insecticide cross a colossal map.\nSafe zones are scarce, but the most formidable nodes wait in the middle of the poison.' },
            14: { name: 'Level 14: Insecticide Ocean', description: 'A huge sea of insecticide covers everything. The bases are separated to the extreme. You will need to calculate the jump toward the elliptical nodes perfectly.' },
            15: { name: 'Level 15: Artillery Fortresses', description: 'Three artillery islands dominate the central puddle. Capture them to crush your enemy under heavy fire, but beware the poison.' },
            16: { name: 'Level 16: Roads and Swamps', description: 'Terrain affects your speed. Green zones make you twice as fast. Red zones slow you to half speed.' },
            17: { name: 'Level 17: The Oasis in the Sticky Desert', description: 'Ninety percent of the map is a slow zone. Only a central oasis offers real mobility and high-value nodes.\nYou must choose between advancing along the edges or fighting for the center.' },
            18: { name: 'Level 18: Interference Stripes', description: 'The field alternates between fast and slow stripes.\nPlan your routes to live in the fast lanes and avoid getting trapped in the mud.' },
            19: { name: 'Level 19: Molasses Delta', description: 'A large viscous zone covers the center, but several fast channels snake through it.\nMastering those channels is the safe way across.' },
            20: { name: 'Level 20: Suction Trap', description: 'Crossing straight through the center bogs you down in an enormous viscous mass.\nThe map edge and artillery offer much cleaner solutions.' },
            21: { name: 'Level 21: Friction Chess', description: 'Every jump between nodes demands choosing the path of least resistance.\nThis is a pure test of micro-management and terrain reading.' },
            22: { name: 'Level 22: The Streamlet', description: 'A water current periodically sweeps the field.\nIt eliminates all troops in its path, allied and enemy alike.\nSynchronize your attacks with the water cycle to win.' },
            23: { name: 'Level 23: Bombardment from the Center', description: 'A circular burst starts in the center and expands to the edges.\nExpand through the perimeter first, then push into the core after the ring passes.' },
            24: { name: 'Level 24: Unpredictable Tides', description: 'Bursts arrive from above, from the right, and diagonally in an irregular sequence.\nYou must adapt quickly and never trust any route for too long.' },
            25: { name: 'Level 25: Convergence', description: 'The tide begins at the edges and contracts lethally toward the center.\nFight from the four cardinal corners while the map shrinks.' },
            26: { name: 'Level 26: Out and Back', description: 'The burst works like a pendulum: it crosses the map, rests briefly, then returns.\nRead the oscillation and attack in the exact opening.' },
            27: { name: 'Level 27: The Spiral Heartbeat', description: 'Barriers pulse outward from the center like a heartbeat.\nTime your advance through the layers while avoiding the solar beam.' },
            28: { name: 'Level 28: The Three Locks', description: 'Three massive barriers cross the map. Their gates open at different times.\nAccumulate troops between locks and advance at the exact moment.' },
            29: { name: 'Level 29: The Shadow Prison', description: 'The richest neural nodes are protected inside timed cells.\nThe Solar Beam punishes active bases; use the prisons as expansion shelters.' },
            30: { name: 'Level 30: Desynced Mirror Maze', description: 'Two options: the central route is fast but packed with deadly blinking walls.\nThe outer route is long, slow, and safer.' },
            31: { name: 'Level 31: The Great Gear', description: 'The gear core becomes accessible every 25 seconds.\nSolar rails clean up formations.' }
        },
        factions: {
            carpinteras: { name: 'Carpenter Ants', trait: 'Evolution Discount', difficulty: 'Very Easy', description: 'They have a permanent 10% discount on node evolution costs.' },
            negras: { name: 'Black Ants', trait: 'Efficient Paths', description: 'They reduce troop investment for Logistic Paths by 20%.' },
            tejedoras: { name: 'Weaver Ants', trait: 'Superior Speed', difficulty: 'Normal', description: 'A +10% multiplier to their base movement speed on all terrain.' },
            cortadoras: { name: 'Leafcutters', trait: 'Mass Generation', difficulty: 'Hard', description: 'Generation +30% in enriched nests, but their troops are more fragile.' },
            fuego: { name: 'Fire Ants', trait: 'Incendiary Attack', difficulty: 'Very Hard', description: 'They apply "Burning" damage over time to enemy nodes for 5 seconds.' },
            bala: { name: 'Bullet Ant', trait: 'Tactical Vampirism', difficulty: 'Infernal', description: 'They generate 1 allied troop for every 3 enemy troops eliminated in combat.' },
            termitas: { name: 'Termites', trait: 'Environmental Consumption', difficulty: 'Special', description: 'They devour physical obstacles and can see through the Fog of War.' },
            avispas: { name: 'Wasps', trait: 'Air Supremacy', difficulty: 'Special', description: 'They fly in a straight line over obstacles. Fixed and slow reproduction rate.' },
            arañas: { name: 'Spiders', trait: 'Cycle Hatching', difficulty: 'Special', description: 'Mass generation in cycles. They weave webs that slow the enemy.' },
            escarabajos: { name: 'Beetles', trait: 'Armored Siege', difficulty: 'Special', description: 'Colossal units with uninterrupted capture. Very resilient.' },
            mutantes: { name: 'Mutant Ants', trait: 'Endemic Venom', difficulty: 'Special', description: 'Aggressive purple-origin troops adapted to highly contaminated environments.' }
        }
    },
    'pt-BR': {
        sectors: {
            1: { name: 'Setor 1: O Despertar', description: 'Fundamentos, mobilidade pura e criação de caminhos logísticos. Aprenda a dominar o enxame. Melhorias desativadas.' },
            2: { name: 'Setor 2: Redes Subterrâneas', description: 'Domine túneis, logística e evoluções táticas. Artilharia, espinhos e tanques começam a definir cada puzzle.' },
            3: { name: 'Setor 3: Zonas de Contenção', description: 'O inseticida elimina ao contato. Ferries, túneis e rotas seguras são tão importantes quanto força bruta.' },
            4: { name: 'Setor 4: Terrenos Viscosos', description: 'Domine fricção, lama e vias rápidas. A velocidade do terreno altera completamente o fluxo do combate.' },
            5: { name: 'Setor 5: Marés Implacáveis', description: 'A água varre tudo pelo caminho. Direção, cadência e leitura do tempo são a chave para sobreviver.' },
            6: { name: 'Setor 6: Barreiras Dinâmicas', description: 'Comportas intermitentes, células pulsantes e varreduras solares transformam cada avanço em uma prova de sincronização.' }
        },
        levels: {
            1: { name: 'Nível 1: Aprenda a Conquistar', description: '1. Clique na sua base azul.\n2. Ajuste a barra de envio de tropas para 100%.\n3. Clique no nó inimigo para atacá-lo.' },
            2: { name: 'Nível 2: Disputa por Recursos', description: 'Garanta os nós de tipo enxame no centro antes do inimigo.' },
            3: { name: 'Nível 3: O Fosso Central', description: 'Estamos cercados. Sobreviva a duas frentes ao mesmo tempo.' },
            4: { name: 'Nível 4: A Fortaleza de Cristal', description: 'Uma muralha de força azul cerca o ninho inimigo por três lados.\nAs formigas não conseguem atravessar a muralha e se acumulam na borda.\nO ferry móvel central sobe e desce cruzando a parede inferior.\nEmbarque suas tropas no ferry para se infiltrar e atacar por dentro.' },
            5: { name: 'Nível 5: A Muralha Intransponível', description: 'Um bloqueio absoluto impede a passagem direta entre seu ninho inferior esquerdo e o inimigo.\nVocê deve contornar a imensa estrutura de cristal conquistando os nós superiores para flanquear.' },
            6: { name: 'Nível 6: Conexões Subterrâneas', description: 'Uma imensa barreira diagonal divide completamente o mapa. A única forma de avançar e sitiar o outro extremo é usando o túnel profundo. Cuidado: a facção laranja está presente nas duas frentes.' },
            7: { name: 'Nível 7: O Baluarte do Artilheiro', description: 'O inimigo está entrincheirado do outro lado do estreito. Reúna suas tropas e assegure os nós centrais para abrir caminho.' },
            8: { name: 'Nível 8: Gargalo Espinhoso', description: 'O mapa é uma ampulheta com um único gargalo central.\nSe transformar esse nó em espinhoso, poderá deter ondas inteiras enquanto prepara o contra-ataque.' },
            9: { name: 'Nível 9: Duelo de Titãs', description: 'Há poucos nós, e todos são gigantes.\nProdução massiva e evolução para tanques decidirão quem sobrevive ao desgaste.' },
            10: { name: 'Nível 10: A Folha Flutuante', description: 'O centro está bloqueado por uma poça letal de inseticida. Use a folha flutuante móvel para atravessar com segurança sem perder tropas.' },
            11: { name: 'Nível 11: O Olho da Tempestade', description: 'Um anel grosso de inseticida protege o núcleo do mapa.\nUse o ferry orbital para cruzar em segurança ou force a passagem aceitando baixas.' },
            12: { name: 'Nível 12: Ilhas de Segurança', description: 'Todo o mapa é um mar de inseticida. Apenas pequenas ilhas seguras ao redor de cada nó permitem reagrupar.\nVocê deve enviar com precisão cirúrgica de ilha em ilha.' },
            13: { name: 'Nível 13: Rios Venenosos', description: 'Três rios de inseticida cruzam um mapa colossal.\nAs zonas seguras são escassas, mas os nós mais formidáveis aguardam em pleno veneno.' },
            14: { name: 'Nível 14: Oceano de Inseticida', description: 'Um enorme mar de inseticida cobre tudo. As bases estão separadas ao extremo. Você deverá calcular perfeitamente o salto até os nós elípticos.' },
            15: { name: 'Nível 15: Fortalezas de Artilharia', description: 'Três ilhas artilhadas dominam a poça central. Capture-as para submeter o inimigo a fogo pesado, mas cuidado com o veneno.' },
            16: { name: 'Nível 16: Estradas e Pântanos', description: 'O terreno afeta sua velocidade. As zonas verdes dobram sua velocidade. As zonas vermelhas reduzem pela metade.' },
            17: { name: 'Nível 17: O Oásis no Deserto Pegajoso', description: 'Noventa por cento do mapa é uma zona lenta. Só um oásis central oferece mobilidade real e nós de grande valor.\nVocê deve decidir entre avançar pelas bordas ou lutar pelo centro.' },
            18: { name: 'Nível 18: Faixas de Interferência', description: 'O campo alterna entre faixas rápidas e lentas.\nPlaneje suas rotas para viver nas vias rápidas e não ficar preso na lama.' },
            19: { name: 'Nível 19: O Delta de Melaço', description: 'Uma grande zona viscosa cobre o centro, mas vários canais rápidos serpenteiam por dentro.\nDominar esses canais é a forma segura de atravessar.' },
            20: { name: 'Nível 20: Armadilha de Sucção', description: 'Cruzar direto pelo centro prende você em uma enorme massa viscosa.\nA borda do mapa e a artilharia oferecem soluções muito mais limpas.' },
            21: { name: 'Nível 21: Xadrez de Fricção', description: 'Cada salto entre nós exige escolher a rota com menos resistência.\nÉ uma prova pura de microgestão e leitura do terreno.' },
            22: { name: 'Nível 22: O Riacho', description: 'Uma corrente de água varre o campo periodicamente.\nElimina todas as tropas pelo caminho, aliadas e inimigas.\nSincronize seus ataques com o ciclo da água para vencer.' },
            23: { name: 'Nível 23: Bombardeio a partir do Centro', description: 'Uma rajada circular nasce no centro e se expande até as bordas.\nExpanda primeiro pela periferia e avance para o núcleo depois que o anel passar.' },
            24: { name: 'Nível 24: Marés Imprevisíveis', description: 'As rajadas chegam de cima, da direita e em diagonais numa sequência irregular.\nVocê precisa se adaptar rápido e não confiar demais em nenhuma rota.' },
            25: { name: 'Nível 25: Convergência', description: 'A maré nasce nas bordas e se contrai de forma letal rumo ao centro.\nLute a partir dos quatro cantos cardeais enquanto o mapa encolhe.' },
            26: { name: 'Nível 26: Ida e Volta', description: 'A rajada funciona como um pêndulo: cruza o mapa, descansa um instante e depois volta.\nLeia a oscilação e ataque exatamente na abertura correta.' },
            27: { name: 'Nível 27: O Batimento da Espiral', description: 'As barreiras pulsam para fora a partir do centro como um batimento.\nSincronize o avanço através das camadas enquanto evita o raio solar.' },
            28: { name: 'Nível 28: As Três Eclusas', description: 'Três barreiras massivas cruzam o mapa. Suas comportas abrem em momentos diferentes.\nAcumule tropas entre as eclusas e avance no momento exato.' },
            29: { name: 'Nível 29: A Prisão de Sombras', description: 'Os nós neurais mais ricos estão protegidos em células temporais.\nO Raio Solar pune bases ativas; use as prisões como refúgios de expansão.' },
            30: { name: 'Nível 30: Labirinto de Espelhos Defasados', description: 'Duas opções: a rota central é rápida, mas está cheia de muros piscantes mortais.\nA rota externa é longa, lenta e mais segura.' },
            31: { name: 'Nível 31: A Grande Engrenagem', description: 'O núcleo da engrenagem fica acessível a cada 25 segundos.\nOs trilhos solares limpam formações.' }
        },
        factions: {
            carpinteras: { name: 'Formigas Carpinteiras', trait: 'Desconto em Evolução', difficulty: 'Muito Fácil', description: 'Possuem um desconto permanente de 10% no custo de evolução dos nós.' },
            negras: { name: 'Formigas Negras', trait: 'Caminhos Eficientes', description: 'Reduzem em 20% o investimento de tropas para estabelecer Caminhos Logísticos.' },
            tejedoras: { name: 'Formigas Tecelãs', trait: 'Velocidade Superior', difficulty: 'Normal', description: 'Multiplicador de +10% na velocidade base de movimento em todos os terrenos.' },
            cortadoras: { name: 'Cortadeiras de Folhas', trait: 'Geração Massiva', difficulty: 'Difícil', description: 'Geração +30% em formigueiros enriquecidos, mas suas tropas são mais frágeis.' },
            fuego: { name: 'Formigas de Fogo', trait: 'Ataque Incendiário', difficulty: 'Muito Difícil', description: 'Aplicam "Incêndio" (dano gradual) aos nós inimigos por 5 segundos.' },
            bala: { name: 'Formiga-Bala', trait: 'Vampirismo Tático', difficulty: 'Infernal', description: 'Geram 1 tropa aliada para cada 3 inimigas eliminadas em combate.' },
            termitas: { name: 'Cupins', trait: 'Consumo Ambiental', difficulty: 'Especial', description: 'Devoram obstáculos físicos e conseguem ver através da Névoa de Guerra.' },
            avispas: { name: 'Vespas', trait: 'Supremacia Aérea', difficulty: 'Especial', description: 'Voam em linha reta sobre obstáculos. Taxa de reprodução fixa e lenta.' },
            arañas: { name: 'Aranhas', trait: 'Eclosão em Ciclo', difficulty: 'Especial', description: 'Geração massiva por ciclos. Tecem redes que desaceleram o inimigo.' },
            escarabajos: { name: 'Besouros', trait: 'Cerco Blindado', difficulty: 'Especial', description: 'Unidades colossais com captura ininterruptível. Muito resistentes.' },
            mutantes: { name: 'Formigas Mutantes', trait: 'Veneno Endêmico', difficulty: 'Especial', description: 'Tropas agressivas de origem púrpura, adaptadas a ambientes altamente contaminados.' }
        }
    },
    'zh-CN': {
        sectors: {
            1: { name: '区域 1：觉醒', description: '基础、纯粹机动与后勤路径建设。学习掌控虫群。升级已禁用。' },
            2: { name: '区域 2：地下网络', description: '掌握隧道、后勤与战术进化。火炮、荆刺和坦克开始决定每个谜题。' },
            3: { name: '区域 3：封锁区', description: '杀虫剂触碰即死。渡运点、隧道和安全路线与蛮力同样重要。' },
            4: { name: '区域 4：黏滞地形', description: '掌握摩擦、泥沼和快速通道。地形速度会彻底改变战斗节奏。' },
            5: { name: '区域 5：无情潮汐', description: '水流会扫尽一切。方向、节奏和时机判断是生存关键。' },
            6: { name: '区域 6：动态屏障', description: '间歇闸门、脉冲囚室和太阳扫射，让每次推进都成为同步考验。' }
        },
        levels: {
            1: { name: '关卡 1：学习征服', description: '1. 点击你的蓝色基地。\n2. 将派兵条调到 100%。\n3. 点击敌方节点发动攻击。' },
            2: { name: '关卡 2：资源争夺', description: '在敌人之前夺取中央的虫群型节点。' },
            3: { name: '关卡 3：中央壕沟', description: '我们被包围了。同时在两条战线上活下来。' },
            4: { name: '关卡 4：水晶堡垒', description: '蓝色力场墙从三面包围敌方巢穴。\n蚂蚁无法穿过墙壁，会堆积在边缘。\n中央移动渡运点上下穿过下方墙体。\n把部队送上渡运点，从内部渗透并攻击。' },
            5: { name: '关卡 5：不可逾越之墙', description: '绝对封锁阻断了你左下巢穴与敌人之间的直线路径。\n你必须占领上方节点，绕过巨大的水晶结构完成侧翼包抄。' },
            6: { name: '关卡 6：地下连接', description: '巨大的斜向屏障将地图完全切开。推进并围攻另一端的唯一方式，是使用深层隧道。小心：橙色阵营同时存在于两条战线。' },
            7: { name: '关卡 7：炮手堡垒', description: '敌人固守在狭道另一侧。集结部队并确保中央节点，打开突破口。' },
            8: { name: '关卡 8：荆刺瓶颈', description: '地图像沙漏，中央只有一个瓶颈。\n如果把该节点变成荆刺节点，就能挡住整波敌军并准备反击。' },
            9: { name: '关卡 9：泰坦决斗', description: '节点很少，而且全都是巨型节点。\n大规模生产和坦克进化将决定谁能熬过消耗战。' },
            10: { name: '关卡 10：漂浮叶片', description: '中央被致命杀虫剂水洼封锁。利用移动漂浮叶片安全渡过，避免损失部队。' },
            11: { name: '关卡 11：风暴之眼', description: '厚重的杀虫剂环保护着地图核心。\n使用轨道渡运点安全穿越，或强行突破并承受伤亡。' },
            12: { name: '关卡 12：安全岛', description: '整张地图都是杀虫剂之海。只有每个节点周围的小型安全岛能让你重整部队。\n你必须以外科手术般的精度从岛到岛派兵。' },
            13: { name: '关卡 13：毒河', description: '三条杀虫剂河流穿过巨大的地图。\n安全区很少，但最强大的节点就等在毒液之中。' },
            14: { name: '关卡 14：杀虫剂海洋', description: '巨大的杀虫剂海覆盖一切。双方基地相距极远。你必须精准计算跳向椭圆节点的时机。' },
            15: { name: '关卡 15：火炮堡垒', description: '三座火炮岛控制中央毒池。夺下它们，用重火力压制敌人，但要小心毒液。' },
            16: { name: '关卡 16：道路与沼泽', description: '地形会影响速度。绿色区域让你速度翻倍，红色区域会让速度减半。' },
            17: { name: '关卡 17：黏性沙漠中的绿洲', description: '地图 90% 都是减速区。只有中央绿洲提供真正机动性和高价值节点。\n你必须选择沿边推进，或争夺中央。' },
            18: { name: '关卡 18：干扰条带', description: '战场在快速与缓慢条带之间交替。\n规划路线，让部队走在快速通道上，不要陷入泥沼。' },
            19: { name: '关卡 19：糖浆三角洲', description: '巨大的黏滞区域覆盖中央，但其中蜿蜒着几条快速通道。\n掌控这些通道是安全穿越的方式。' },
            20: { name: '关卡 20：吸陷阱', description: '直接穿过中央会让你陷入巨大的黏滞团块。\n地图边缘和火炮能提供更干净的解法。' },
            21: { name: '关卡 21：摩擦棋局', description: '每次节点跳跃都要求选择阻力最小的路线。\n这是纯粹的微操和地形判断测试。' },
            22: { name: '关卡 22：小溪流', description: '水流会周期性扫过战场。\n它会消灭路径上的所有部队，无论敌我。\n同步你的进攻与水流周期才能获胜。' },
            23: { name: '关卡 23：中心轰击', description: '圆形冲击从中央诞生并扩散到边缘。\n先沿外围扩张，等圆环经过后再推进核心。' },
            24: { name: '关卡 24：不可预测的潮汐', description: '冲击会从上方、右侧和对角线方向以不规则顺序袭来。\n你必须快速适应，不要过久相信任何路线。' },
            25: { name: '关卡 25：收束', description: '潮汐从边缘生成，并致命地向中央收缩。\n在地图缩小时，从四个方位角落战斗。' },
            26: { name: '关卡 26：往返', description: '冲击像钟摆一样运作：穿过地图，短暂停顿，然后返回。\n读懂摆动，在正确空隙发动攻击。' },
            27: { name: '关卡 27：螺旋心跳', description: '屏障像心跳一样从中央向外脉冲。\n在避开太阳光束的同时，同步穿越各层。' },
            28: { name: '关卡 28：三道船闸', description: '三道巨大屏障横跨地图。它们的闸门会在不同时间打开。\n在船闸之间积累部队，并在准确时刻推进。' },
            29: { name: '关卡 29：暗影监狱', description: '最富饶的神经节点被保护在定时囚室中。\n太阳光束会惩罚活跃基地；把监狱当作扩张避难所。' },
            30: { name: '关卡 30：错相镜像迷宫', description: '两个选择：中央路线很快，但布满致命闪烁墙。\n外侧路线漫长、缓慢，但更安全。' },
            31: { name: '关卡 31：巨型齿轮', description: '齿轮核心每 25 秒开放一次。\n太阳轨道会清理阵型。' }
        },
        factions: {
            carpinteras: { name: '木匠蚁', trait: '进化折扣', difficulty: '非常简单', description: '节点进化费用永久降低 10%。' },
            negras: { name: '黑蚁', trait: '高效路径', description: '建立后勤路径所需的部队投入减少 20%。' },
            tejedoras: { name: '织叶蚁', trait: '高速移动', difficulty: '普通', description: '所有地形中的基础移动速度提高 10%。' },
            cortadoras: { name: '切叶蚁', trait: '大规模生成', difficulty: '困难', description: '富集蚁巢生成量 +30%，但部队更脆弱。' },
            fuego: { name: '火蚁', trait: '燃烧攻击', difficulty: '非常困难', description: '对敌方节点施加持续 5 秒的“燃烧”渐进伤害。' },
            bala: { name: '子弹蚁', trait: '战术吸血', difficulty: '地狱', description: '每消灭 3 名敌军，就生成 1 名友军部队。' },
            termitas: { name: '白蚁', trait: '环境吞噬', difficulty: '特殊', description: '吞噬实体障碍，并能看穿战争迷雾。' },
            avispas: { name: '黄蜂', trait: '空中优势', difficulty: '特殊', description: '以直线飞越障碍。繁殖率固定且缓慢。' },
            arañas: { name: '蜘蛛', trait: '周期孵化', difficulty: '特殊', description: '按周期大规模生成。织网减缓敌人。' },
            escarabajos: { name: '甲虫', trait: '装甲围攻', difficulty: '特殊', description: '巨型单位，捕获过程不可打断。非常坚韧。' },
            mutantes: { name: '变异蚁', trait: '地方性毒液', difficulty: '特殊', description: '源自紫色变异的进攻型部队，适应高度污染环境。' }
        }
    }
};

function localized(path, fallback) {
    const language = getLanguage();
    if (language === 'es') return fallback;

    const value = path.split('.').reduce((node, key) => node?.[key], CONTENT[language]);
    return value || fallback;
}

export function localizeSector(sector, sectorNumber) {
    return {
        name: localized(`sectors.${sectorNumber}.name`, sector.name),
        description: localized(`sectors.${sectorNumber}.description`, sector.description)
    };
}

export function localizeLevel(level, absoluteLevelNumber) {
    return {
        name: localized(`levels.${absoluteLevelNumber}.name`, level.name),
        description: localized(`levels.${absoluteLevelNumber}.description`, level.description)
    };
}

export function localizeFaction(faction) {
    return {
        name: localized(`factions.${faction.id}.name`, faction.name),
        trait: localized(`factions.${faction.id}.trait`, faction.trait),
        difficulty: localized(`factions.${faction.id}.difficulty`, faction.difficulty),
        description: localized(`factions.${faction.id}.description`, faction.description)
    };
}
