const options = (values) =>
  values.map((text, index) => ({ id: String.fromCharCode(65 + index), text }));
const choice = (number, prompt, values, answer, explanation, weight = 1) => ({
  id: `q${number}`,
  number,
  type: 'choice',
  prompt,
  options: typeof values[0] === 'string' ? options(values) : values,
  answer,
  explanation,
  weight,
});

const clozeOptions = options([
  'accessible',
  'abandon',
  'deliberately',
  'evidence',
  'flexible',
  'isolation',
  'measurable',
  'participate',
  'reinforce',
  'retrieve',
  'scarce',
  'sequence',
  'temporary',
  'underestimate',
  'variety',
]);
const matchingOptions = options(
  Array.from({ length: 10 }, (_, i) => `Paragraph ${String.fromCharCode(65 + i)}`),
);

const listeningGroups = [
  {
    id: 'conversation-1',
    title: 'Section A · Conversation One',
    instructions: 'Questions 1 to 4 are based on the conversation you hear.',
    transcript: `Woman: I heard your team is moving the campus repair workshop to the library. Is the old room too small?
Man: Size is not the problem. The engineering building is far from most students, so few people even notice our posters. The library is much easier to reach.
Woman: Will students still need an appointment?
Man: Only for electrical devices. Those repairs require supervision. For a loose chair leg or a torn bag, students can simply drop in on Wednesday afternoons.
Woman: That sounds convenient. Are you planning to buy more tools?
Man: We already have enough. What we lack is people who can show beginners how to use them safely. We are asking experienced volunteers to lead short demonstrations.
Woman: How will you decide whether the move is successful?
Man: We will count repaired items, but our main measure is whether visitors return and attempt a repair independently. Saving a single object matters, yet building confidence has a longer effect.
Woman: Then perhaps your posters should include a beginner's story.
Man: Exactly. A perfect final result can look intimidating. A photograph of someone learning would be more inviting.`,
    questions: [
      choice(
        1,
        'Why is the workshop moving to the library?',
        [
          'The current room cannot fit the tools.',
          'It will become easier for students to access.',
          'The library has offered new equipment.',
          'Engineering students no longer need it.',
        ],
        'B',
        '男士明确说工程楼距离多数学生太远，而图书馆 easier to reach。搬迁原因是可达性，并非空间不足。',
      ),
      choice(
        2,
        'Which activity still requires an appointment?',
        [
          'Mending a torn bag.',
          'Repairing a loose chair leg.',
          'Watching a demonstration.',
          'Repairing an electrical device.',
        ],
        'D',
        'Only for electrical devices 对应电器维修；后句说明这类维修需要监督。',
      ),
      choice(
        3,
        'What does the workshop need most?',
        [
          'Volunteers who can teach safe tool use.',
          'Money for additional tools.',
          'A larger collection of posters.',
          'Students with professional qualifications.',
        ],
        'A',
        '男士说工具已经足够，缺少能教初学者安全使用工具的人。',
      ),
      choice(
        4,
        'What is the main sign of success for the man?',
        [
          'How attractive the repaired objects look.',
          'How many photographs are published.',
          'Whether visitors return to attempt a repair independently.',
          'Whether every object can be repaired.',
        ],
        'C',
        'main measure 是访客再次参与并独立尝试维修，体现自信和能力的增长；原文不要求每次尝试都成功。',
      ),
    ],
  },
  {
    id: 'conversation-2',
    title: 'Section A · Conversation Two',
    instructions: 'Questions 5 to 8 are based on the conversation you hear.',
    transcript: `Man: Your transport survey had hundreds of responses. Did you find that students prefer cycling?
Woman: Not exactly. Most respondents were members of the cycling club, so the sample cannot represent the whole university.
Man: Could you correct that by collecting more responses through the same mailing list?
Woman: A bigger sample from the same group would preserve the bias. We need to invite students from different departments and include those who live off campus.
Man: The deadline is Friday. Will you have enough time?
Woman: I have asked for a one-week extension. Meanwhile, we can improve the questions. Asking whether people support a healthy, green transport policy suggests the answer we want.
Man: So we should ask about actual trips instead?
Woman: Yes. For example, how did you travel to campus yesterday? We should also ask what prevents people from cycling. Some may support it but have nowhere secure to leave a bicycle.
Man: Then the final report should distinguish preferences from practical barriers.
Woman: Exactly. The aim is to help the university make a useful decision, not simply to produce a popular headline.`,
    questions: [
      choice(
        5,
        'What problem does the woman identify in the survey?',
        [
          'The questions were written in another language.',
          'Too many responses were incomplete.',
          'The respondents came mainly from one group.',
          'The university did not approve the topic.',
        ],
        'C',
        '大部分答卷来自自行车社团，样本不能代表全校，属于选择偏差。',
      ),
      choice(
        6,
        'Why would more responses from the same mailing list be insufficient?',
        [
          'They would exceed the storage limit.',
          'They would retain the existing sampling bias.',
          'They would delay publication by a month.',
          'They would contain too many travel methods.',
        ],
        'B',
        'A bigger sample from the same group would preserve the bias：样本量增加并不会自动消除抽样偏差。',
      ),
      choice(
        7,
        'What kind of question does the woman recommend?',
        [
          'A question about an actual recent journey.',
          'A question praising environmentally friendly travel.',
          'A question asking students to design a poster.',
          'A question about the cycling club president.',
        ],
        'A',
        '建议问 how did you travel to campus yesterday，收集实际行为，避免带有价值暗示的引导式提问。',
      ),
      choice(
        8,
        'What should the final report distinguish?',
        [
          'Morning classes from afternoon classes.',
          'University staff from local residents.',
          'Short answers from long comments.',
          "People's preferences from obstacles to action.",
        ],
        'D',
        '对话最后明确提出 distinguish preferences from practical barriers，即区分偏好与实际障碍。',
      ),
    ],
  },
  {
    id: 'passage-1',
    title: 'Section B · Passage One',
    instructions: 'Questions 9 to 11 are based on the passage you hear.',
    transcript: `A neighbourhood library wanted to make its evening programme more accessible. Initially, staff assumed that a lack of interest explained low attendance. Interviews suggested a different explanation: many residents finished work after the building closed. The library therefore tested late opening on Thursdays for eight weeks. It did not change its collection or advertise new activities during the trial. Staff recorded visitor numbers and asked new visitors how they had heard about the service. Attendance rose, especially among people employed in nearby shops. However, the librarians resisted the temptation to attribute every additional visit to the longer hours. The trial also took place during a rainy season, when outdoor activities were less attractive. They planned another trial in summer. During that trial, they would compare attendance with a similar branch whose opening hours would remain unchanged.`,
    questions: [
      choice(
        9,
        'What prevented many residents from attending the library?',
        [
          'A lack of books in their preferred language.',
          'Closing hours that conflicted with their jobs.',
          'Expensive membership fees.',
          'Difficulty finding the entrance.',
        ],
        'B',
        '访谈发现居民下班时图书馆已关门，问题在开放时段与工作时间冲突。',
      ),
      choice(
        10,
        'What did the library change during the first trial?',
        [
          'The price of borrowing books.',
          'The size of the book collection.',
          'Its opening hours on Thursdays.',
          'The number of advertised activities.',
        ],
        'C',
        '试验变量是周四延长开放，馆藏和活动宣传保持不变。',
      ),
      choice(
        11,
        'Why did the staff plan another trial?',
        [
          'To examine whether weather affected the results.',
          'To close the neighbouring branch.',
          'To reduce the number of visitors.',
          'To replace the interview method entirely.',
        ],
        'A',
        '雨季可能影响室内活动需求；夏季复试并与另一分馆比较有助于检查这一混杂因素。',
      ),
    ],
  },
  {
    id: 'passage-2',
    title: 'Section B · Passage Two',
    instructions: 'Questions 12 to 13 are based on the passage you hear.',
    transcript: `When a small museum digitised its photograph collection, volunteers initially focused on identifying famous buildings. Yet ordinary details proved just as valuable. Shop signs revealed how streets had changed, while handwritten notes helped establish dates. The museum asked residents to submit what they remembered, but it did not immediately treat every memory as a verified fact. Two accounts of the same image sometimes contradicted each other. Instead of choosing the more confident speaker, the curator kept both accounts and searched for supporting documents. Entries were marked as confirmed, probable or unresolved. This made the catalogue slightly less tidy, but considerably more honest. The project showed that public participation can enrich an archive when uncertainty is recorded rather than hidden.`,
    questions: [
      choice(
        12,
        'How did the curator handle conflicting memories?',
        [
          'The more confident account was accepted.',
          'Both accounts were deleted.',
          'The older resident was always believed.',
          'Both accounts were retained while evidence was sought.',
        ],
        'D',
        '馆员保留两种说法并寻找文件证据，没有凭叙述者的自信程度判定。',
      ),
      choice(
        13,
        'What is the main lesson of the project?',
        [
          'Only experts should contribute to archives.',
          'Uncertainty should be documented transparently.',
          'Ordinary details have little historical value.',
          'Digitisation removes the need to verify facts.',
        ],
        'B',
        '结尾强调 recorded rather than hidden，公开记录不确定性能够提升档案的诚实性。',
      ),
    ],
  },
  {
    id: 'passage-3',
    title: 'Section B · Passage Three',
    instructions: 'Questions 14 to 15 are based on the passage you hear.',
    transcript: `A university cafeteria tried to reduce food waste by displaying signs about environmental responsibility. Waste barely changed. The manager then measured what was being thrown away and found that side dishes accounted for most leftovers. Students often wanted the main dish but could not choose a smaller portion of rice. The cafeteria introduced a small serving as the default and offered a free refill. Waste declined without a fall in student satisfaction. The manager stressed that the experiment had not proved students were indifferent to the environment. Instead, it revealed that the serving system had made waste difficult to avoid. A modest change to an everyday choice had achieved what a general appeal had not.`,
    questions: [
      choice(
        14,
        'Which change helped reduce food waste?',
        [
          'Smaller default portions with free refills.',
          'Removing all side dishes from the menu.',
          'Charging students for every leftover.',
          'Replacing meals with environmental talks.',
        ],
        'A',
        'small serving as the default and a free refill：小份作为默认选项，不够可以免费续添。',
      ),
      choice(
        15,
        'What did the manager conclude?',
        [
          'Students never respond to information.',
          'Student satisfaction must fall to reduce waste.',
          'The serving system had contributed to waste.',
          'Rice should no longer be served.',
        ],
        'C',
        '原来的配餐方式让浪费难以避免，改变选择条件比泛泛宣传更有效；不能推出学生不关心环境。',
      ),
    ],
  },
  {
    id: 'lecture-1',
    title: 'Section C · Talk One',
    instructions: 'Questions 16 to 19 are based on the talk you hear.',
    transcript: `Today I want to discuss the difference between recognising information and retrieving it. When you reread a familiar page, its phrases may feel effortless. That feeling is useful, but it can be mistaken for the ability to explain the idea without the page. A simple alternative is to close the book and write down what you remember. The attempt may expose gaps that rereading concealed. Check those gaps against the source afterwards; otherwise, an error can become familiar through repetition. Retrieval should also be distributed over time. Five brief sessions across a week provide opportunities to recover a memory after some forgetting has occurred. That does not mean that every difficult exercise is beneficial. If you have no relevant knowledge at all, repeated guessing wastes time. Begin with instruction and manageable questions, then gradually remove support. Finally, use questions that ask you to explain connections, not merely reproduce definitions. A student who can state a rule but cannot recognise when it applies has learned only part of what is needed.`,
    questions: [
      choice(
        16,
        'What can the ease of rereading be mistaken for?',
        [
          'An inability to recognise familiar phrases.',
          'A sign that a topic is unimportant.',
          'A need to replace the textbook.',
          'An ability to explain ideas without support.',
        ],
        'D',
        '熟悉感可能被误当成脱离材料也能解释概念的能力。',
        2,
      ),
      choice(
        17,
        'What should students do after trying to recall information?',
        [
          'Avoid the original material permanently.',
          'Compare their recall with the source.',
          'Repeat every answer without checking.',
          'Begin a completely unrelated subject.',
        ],
        'B',
        'Check those gaps against the source afterwards，随后核对能避免反复强化错误。',
        2,
      ),
      choice(
        18,
        'What does the speaker recommend for a complete beginner?',
        [
          'Start with instruction and manageable questions.',
          'Guess difficult answers repeatedly.',
          'Remove all support immediately.',
          'Memorise only the page layout.',
        ],
        'A',
        '讲者说缺乏基础时重复猜测浪费时间，应该先接受讲解，练习可完成的问题，再逐渐撤去支持。',
        2,
      ),
      choice(
        19,
        'What ability goes beyond reproducing a definition?',
        [
          'Reading the rule more quickly.',
          'Remembering where it appears on a page.',
          'Recognising when the rule applies.',
          'Copying the definition without errors.',
        ],
        'C',
        '最后一句把背出规则和判断其适用情境作比较，后者才能体现应用理解。',
        2,
      ),
    ],
  },
  {
    id: 'lecture-2',
    title: 'Section C · Talk Two',
    instructions: 'Questions 20 to 22 are based on the talk you hear.',
    transcript: `Urban planners often describe a park as public because entry is free. But formal access does not guarantee that everyone can use it comfortably. Consider a route with several steep steps. A young visitor may hardly notice them, while someone pushing a wheelchair may have to turn back. In our design studio, we therefore invite people with different mobility needs to walk through an early plan with us. This happens before expensive construction begins. Their observations frequently improve the park for many other visitors as well. A smooth, clearly marked path can help people carrying shopping or accompanying small children. However, no single feature solves every problem. Some people need quiet places away from crowds; others feel safer near a busy entrance. We aim to offer a range of spaces connected by accessible routes. Success is not a drawing that meets a checklist on paper. It is a place whose actual users can choose where to go and feel welcome when they arrive.`,
    questions: [
      choice(
        20,
        'Why does the speaker question the meaning of a public park?',
        [
          'All parks should charge an entrance fee.',
          'Free entry does not ensure practical accessibility.',
          'Most visitors prefer indoor recreation.',
          'Urban planners cannot influence visitor experience.',
        ],
        'B',
        '形式上的免费进入不等于使用中的便利，台阶可能阻挡轮椅使用者。',
        2,
      ),
      choice(
        21,
        'When are people with different mobility needs involved?',
        [
          'Only after the park has opened.',
          'After every construction contract is completed.',
          'When the park is about to close.',
          'During the early planning stage.',
        ],
        'D',
        '邀请发生在 early plan 阶段、昂贵施工开始之前，以便及时修正设计。',
        2,
      ),
      choice(
        22,
        'What is the main design goal described in the talk?',
        [
          'A choice of welcoming spaces linked by accessible routes.',
          'The same quiet environment in every part of the park.',
          'A single entrance used by all visitors.',
          'A visually impressive plan regardless of use.',
        ],
        'A',
        '方案保留不同空间，让人有选择，并用无障碍路线连接，不假设所有人偏好相同。',
        2,
      ),
    ],
  },
  {
    id: 'lecture-3',
    title: 'Section C · Talk Three',
    instructions: 'Questions 23 to 25 are based on the talk you hear.',
    transcript: `In collaborative research, a shared folder is not the same thing as a shared understanding. Team members may save files with names that seem obvious to them but mean little to someone else. A table called final results might have several versions, each based on a different exclusion rule. Our laboratory now records a short explanation beside every processed dataset: where it came from, what changed, and why. We preserve the original files and run transformations through scripts. This takes time at the beginning, but it makes later questions much easier to answer. We also distinguish an observation from its interpretation. A graph may show a relationship between two measurements; that alone does not establish that one caused the other. New members are encouraged to challenge the explanation and inspect the data. The purpose of documentation is not to make research look perfectly linear. It is to let another person reconstruct the decisions, including the ones that did not work, and judge the conclusions on their evidence.`,
    questions: [
      choice(
        23,
        'What problem can a file named final results create?',
        [
          'It prevents the file from being opened.',
          'It proves that the analysis is complete.',
          'It can conceal different versions and processing choices.',
          'It automatically removes the original data.',
        ],
        'C',
        '同名 final results 可能对应不同排除规则和版本，名称本身不能说明处理过程。',
        2,
      ),
      choice(
        24,
        'What does the laboratory record beside processed datasets?',
        [
          'The origin of the data and the reasons for changes.',
          'Only the name of the most senior researcher.',
          'The expected public reaction to the findings.',
          'A promise that every result is correct.',
        ],
        'A',
        'where it came from, what changed, and why 对应来源、处理内容及理由。',
        2,
      ),
      choice(
        25,
        'What is documentation intended to enable?',
        [
          'The removal of unsuccessful attempts.',
          "Automatic acceptance of the team's conclusions.",
          'A perfectly linear account of all research.',
          'Reconstruction and evaluation of research decisions.',
        ],
        'D',
        '文档应帮助他人重建决策过程，并依据证据评价结论；失败尝试也应保留。',
        2,
      ),
    ],
  },
];

const readingGroups = [
  {
    id: 'cloze',
    title: 'Section A · 选词填空',
    instructions: 'Select one word for each blank. Each word may be used only once.',
    passage: `When a community learning centre opened beside a railway station, its organisers expected convenient transport to attract students. Yet being physically (26) _____ was only a beginning. Interviews revealed that shift workers needed a more (27) _____ schedule, while recent arrivals wanted opportunities to overcome social (28) _____.

The centre responded by offering short workshops at different times. Instead of asking learners to memorise a fixed (29) _____ of facts, tutors invited them to connect new ideas with their own experience. Several days later, participants were asked to (30) _____ the main ideas from memory before reopening their notes. They were also encouraged to explain an idea to a partner, because explaining can (31) _____ understanding.

The organisers did not assume that a crowded classroom was sufficient (32) _____ of success. They looked for (33) _____ changes in what learners could do independently. They also recognised that teachers sometimes (34) _____ the knowledge adults bring from work and family life. By treating that experience as a resource, the centre made it easier for hesitant newcomers to (35) _____.`,
    questions: [
      choice(
        26,
        'Choose the word for blank (26).',
        clozeOptions,
        'A',
        'physically accessible 表示地点容易到达；上下文提到铁路站旁、交通便利。',
        0.5,
      ),
      choice(
        27,
        'Choose the word for blank (27).',
        clozeOptions,
        'E',
        '轮班工作者需要 flexible schedule，即灵活安排的课程时间。',
        0.5,
      ),
      choice(
        28,
        'Choose the word for blank (28).',
        clozeOptions,
        'F',
        'social isolation 意为社会隔离或孤独状态，和新来者寻求交流机会呼应。',
        0.5,
      ),
      choice(
        29,
        'Choose the word for blank (29).',
        clozeOptions,
        'L',
        'a fixed sequence of facts 指固定顺序的一串事实，与联系个人经验的学习方式相对。',
        0.5,
      ),
      choice(
        30,
        'Choose the word for blank (30).',
        clozeOptions,
        'J',
        'retrieve ideas from memory 意为从记忆中提取观点；后文 before reopening their notes 表明先回忆、再看笔记。reinforce 表示巩固，不能表达从记忆中提取的动作。',
        0.5,
      ),
      choice(
        31,
        'Choose the word for blank (31).',
        clozeOptions,
        'I',
        'reinforce understanding 意为巩固理解，向伙伴解释概念可以加强掌握。',
        0.5,
      ),
      choice(
        32,
        'Choose the word for blank (32).',
        clozeOptions,
        'D',
        'sufficient evidence of success 意为成功的充分证据；人数多不能独自证明学习有效。',
        0.5,
      ),
      choice(
        33,
        'Choose the word for blank (33).',
        clozeOptions,
        'G',
        'measurable changes 是可衡量的变化，组织者要看学员能否独立完成任务。',
        0.5,
      ),
      choice(
        34,
        'Choose the word for blank (34).',
        clozeOptions,
        'N',
        'underestimate 意为低估，与后文把成人已有经验视为资源的做法呼应。',
        0.5,
      ),
      choice(
        35,
        'Choose the word for blank (35).',
        clozeOptions,
        'H',
        'make it easier for somebody to participate 意为使某人更容易参与。',
        0.5,
      ),
    ],
  },
  {
    id: 'matching',
    title: 'Section B · 长篇阅读',
    instructions: 'Match each statement to the paragraph containing the information.',
    passage: `The Many Lives of a Public Library

[A] At first glance, the public library appears to be a stable institution: shelves, desks and a counter for borrowing books. Its daily work, however, changes as the needs of its community change. The central question is not whether libraries should preserve books or embrace new services. It is how they can provide reliable access to knowledge while responding to the people around them.

[B] The most immediate obstacle is sometimes a timetable. In one neighbourhood, a library learned that shop workers could never attend an afternoon reading group. Staff moved one session to the evening and repeated it at the weekend. The change required no new technology, but it allowed residents who had previously been absent to take part.

[C] Digital services can remove a journey, yet they can also create another barrier. A person may own a phone without having enough mobile data to download a large document. A website that assumes every visitor has a new device may exclude precisely those people who rely most on public provision. Several branches therefore keep low-bandwidth versions of important resources.

[D] Noise creates a different tension. Some visitors need silence to study; others come to discuss a project or practise a language. Treating either group as the only legitimate user produces unnecessary conflict. A practical response is to establish clearly separated quiet and conversation areas, with signs explaining the boundary between them.

[E] Staff members frequently help people complete online applications. This work requires care because an application may contain sensitive personal information. One branch provides privacy screens and asks users to enter passwords themselves. Its policy is to explain the process without retaining a copy of the visitor's private documents.

[F] Volunteers extend what a library can offer, but their time is not an unlimited resource. A successful programme gives each volunteer a clear task, suitable preparation and a person to contact when a problem arises. Assuming that enthusiasm can replace coordination often leaves both volunteers and visitors disappointed.

[G] Lending objects rather than books can be a natural extension of access. A collection of household tools allows residents to complete occasional tasks without buying equipment they will rarely use. Staff inspect returned items and provide safety information. The collection also makes the financial cost of maintaining a shared service visible.

[H] Measuring a library only by the number of items borrowed can overlook much of its contribution. A visitor who learns to submit a job application may borrow nothing. Some libraries combine conventional counts with short accounts of what visitors achieved. These accounts do not replace numerical evidence; they help explain what a number leaves out.

[I] A local history project can invite residents to annotate old photographs. Memories add context that official records may lack, but they can also conflict. Responsible catalogues preserve competing accounts and indicate which details remain uncertain. A confident story should not automatically become an established fact.

[J] The library's future depends partly on whether users can influence its decisions. Occasional surveys are useful, but they tend to reach people already comfortable with the institution. Staff can also visit community organisations and ask non-users what would make a visit worthwhile. Listening beyond the existing audience broadens the evidence on which decisions are based.`,
    questions: [
      choice(
        36,
        'A service should avoid storing the personal documents it helps visitors use.',
        matchingOptions,
        'E',
        'E段介绍办理在线申请时的隐私措施，并明确不留存访客私人文件。',
      ),
      choice(
        37,
        'Qualitative accounts can reveal benefits that borrowing statistics miss.',
        matchingOptions,
        'H',
        'H段说明仅用借阅量会忽略服务价值，简短的访客成果记录能补充数量指标。',
      ),
      choice(
        38,
        'Changing meeting times enabled previously absent workers to attend.',
        matchingOptions,
        'B',
        'B段把读书活动改到晚上并在周末重复，商店工作人员因此能参加。',
      ),
      choice(
        39,
        'A shared collection can reduce the need to purchase rarely used equipment.',
        matchingOptions,
        'G',
        'G段介绍工具借用，居民无需购买偶尔才使用的设备。',
      ),
      choice(
        40,
        'People who do not currently use a service can provide useful evidence for its improvement.',
        matchingOptions,
        'J',
        'J段建议走访社区组织、询问非使用者，扩展决策依据。',
      ),
      choice(
        41,
        'Different needs for sound can be accommodated by separating spaces.',
        matchingOptions,
        'D',
        'D段通过分隔安静区域和讨论区域，兼顾学习与交流需求。',
      ),
      choice(
        42,
        'Owning a mobile device does not necessarily make digital resources usable.',
        matchingOptions,
        'C',
        'C段指出即使有手机，也可能缺流量或设备过旧，需要低带宽资源。',
      ),
      choice(
        43,
        'Uncertain historical details should remain visibly uncertain in a catalogue.',
        matchingOptions,
        'I',
        'I段要求保留冲突记忆并标注不确定之处，不能凭讲述自信就当作事实。',
      ),
      choice(
        44,
        'Enthusiastic helpers still need training, defined responsibilities and support.',
        matchingOptions,
        'F',
        'F段说明志愿者需要清晰任务、适当准备和联系支持，热情不能替代组织协调。',
      ),
      choice(
        45,
        'Preserving established resources and responding to changing needs need not be opposing aims.',
        matchingOptions,
        'A',
        'A段将保留书籍与新服务的二选一改写为兼顾知识获取和社区需求。',
      ),
    ],
  },
  {
    id: 'reading-1',
    title: 'Section C · Passage One',
    instructions: 'Choose the best answer to each question based on the passage.',
    passage: `The Value of an Uninterrupted Hour

Many organisations count visible activity because it is easy to observe. A quick reply to a message can be recorded; a useful idea taking shape during an uninterrupted hour is harder to see. This creates an incentive to remain constantly available, even when the work itself requires concentration. Employees may begin to optimise the appearance of responsiveness rather than the quality of their decisions.

A small design company questioned this habit after several staff members described their days as busy but fragmented. It introduced two mornings each week without routine internal meetings. Employees could still contact one another about urgent problems, but ordinary questions were collected for a discussion at midday. The company did not prescribe how every minute should be spent. Its aim was to give people enough continuity to choose an appropriate method for their work.

The first results were mixed. Some designers finished complex tasks sooner, while new employees worried that asking for help would violate an unwritten rule. Managers responded by making exceptions explicit and assigning each newcomer a colleague who remained available. This adjustment mattered: a policy designed to protect attention could otherwise have isolated those who needed guidance most.

The company also avoided treating a lower message count as proof of better performance. Instead, it reviewed completed work, deadlines and staff accounts of obstacles. Fewer interruptions were valuable only if they supported worthwhile outcomes. A silent office could still be an unproductive one.

The experiment suggests that concentration is not simply an individual skill. It is also shaped by shared expectations about availability. Personal discipline can help, but it has limits when everyone is expected to answer immediately. Organisations that want thoughtful work need to make room for it, while preserving the cooperation on which that work depends.`,
    questions: [
      choice(
        46,
        'What problem does the author identify in the first paragraph?',
        [
          'Creative work can never be evaluated.',
          'Visible responsiveness may be rewarded over work quality.',
          'Employees generally dislike communicating.',
          'Recorded messages always improve decisions.',
        ],
        'B',
        '第一段指出容易观察的即时回复可能被过度奖励，员工因此优化“看起来在响应”的形象而非决策质量。',
        2,
      ),
      choice(
        47,
        "What was the main purpose of the company's new arrangement?",
        [
          'To prohibit all contact among employees.',
          'To remove managers from daily work.',
          'To impose the same working method on everyone.',
          'To provide sustained time for focused work.',
        ],
        'D',
        '第二段明确目的是 give people enough continuity，紧急联系仍然允许，也不规定每分钟怎么用。',
        2,
      ),
      choice(
        48,
        'Why did managers assign available colleagues to newcomers?',
        [
          'To prevent the policy from depriving them of needed support.',
          'To make newcomers attend more routine meetings.',
          'To monitor every message they sent.',
          'To replace their formal training entirely.',
        ],
        'A',
        '新员工担心求助违反隐性规则，明确例外并指定可求助对象可以避免专注政策让他们孤立无援。',
        2,
      ),
      choice(
        49,
        'What does the sentence "A silent office could still be an unproductive one" imply?',
        [
          'Silence necessarily damages employee morale.',
          'Message counts are the most reliable performance indicator.',
          'Reduced communication alone does not demonstrate better results.',
          'All offices should encourage continuous conversation.',
        ],
        'C',
        '安静或消息减少本身不是绩效改善的证据，还须看完成的工作、期限和实际障碍。',
        2,
      ),
      choice(
        50,
        "Which statement best represents the author's conclusion?",
        [
          'Concentration depends entirely on personal discipline.',
          'Shared working expectations influence the ability to concentrate.',
          'Cooperation should be sacrificed whenever work is difficult.',
          'Every organisation should adopt exactly two meeting-free mornings.',
        ],
        'B',
        '最后一段将注意力与共同的在线响应期待联系起来，强调组织条件和合作也重要，未主张照搬同一安排。',
        2,
      ),
    ],
  },
  {
    id: 'reading-2',
    title: 'Section C · Passage Two',
    instructions: 'Choose the best answer to each question based on the passage.',
    passage: `Repair as a Form of Knowledge

When an object stops working, replacement often appears to be the simplest response. The price of a new product is visible, while the time and uncertainty involved in repair are difficult to estimate. Yet this comparison can obscure another cost: each discarded object may represent a missed opportunity to understand how everyday things work.

Community repair events attempt to recover that opportunity. Visitors bring a damaged item and work alongside a volunteer to investigate the fault. A successful event is not one at which experts silently fix everything for a waiting queue. Its distinctive value lies in making the reasoning visible: checking a connection, testing one possibility, and revising an explanation when the evidence does not fit.

This does not mean that every item should be repaired at any cost. Some faults require specialist equipment; some damaged products are unsafe to handle. Responsible volunteers explain these limits and recommend a qualified professional when needed. A repair culture that ignores risk would undermine the trust on which participation depends.

There are also structural limits. A device may be difficult to open without breaking its case, and replacement parts may be unavailable. Teaching consumers patience cannot solve those problems. Manufacturers influence repairability through decisions about components, documentation and access to spare parts. The burden should therefore not fall entirely on the person who happens to own a broken object.

Even when an attempt fails, participants may leave with useful knowledge. They can become better at describing a problem, assessing a claim about a product, or recognising when professional help is appropriate. Repair is thus both a practical activity and an exercise in informed judgement. Its wider contribution depends less on pretending that everything can be saved than on making the conditions for sensible decisions more widely available.`,
    questions: [
      choice(
        51,
        'What can a simple price comparison overlook?',
        [
          'The fact that all repairs are inexpensive.',
          'The need to replace unsafe products.',
          'An opportunity to learn how objects function.',
          'The convenience of buying new products.',
        ],
        'C',
        '第一段指出丢弃物品也可能丢掉理解日常物品工作方式的学习机会。',
        2,
      ),
      choice(
        52,
        'What distinguishes a valuable community repair event?',
        [
          'Participants can observe and share the reasoning process.',
          'Experts repair all items without explanation.',
          'Visitors are guaranteed a fully working product.',
          'Waiting times are reduced to zero.',
        ],
        'A',
        '第二段强调 making the reasoning visible，让访客参与检查、测试和修正解释，而不是只等专家代修。',
        2,
      ),
      choice(
        53,
        'Why should volunteers acknowledge the limits of their abilities?',
        [
          'To avoid answering any technical questions.',
          'To discourage community participation.',
          'To prove that most products are worthless.',
          'To protect safety and maintain public trust.',
        ],
        'D',
        '第三段把专业能力边界、安全和信任相联系，需要时应转介合格专业人士。',
        2,
      ),
      choice(
        54,
        "What is the author's view of manufacturers?",
        [
          'They are unable to affect the repair process.',
          'Their design and parts policies influence repairability.',
          'They should leave all decisions to consumers.',
          'They can guarantee that every repair will succeed.',
        ],
        'B',
        '第四段明确指出组件、说明文档和零件供应均会影响可维修性，不能把责任都放在消费者身上。',
        2,
      ),
      choice(
        55,
        'What may a participant gain from an unsuccessful repair?',
        [
          'Proof that replacement is always the best choice.',
          'The ability to repair every other type of product.',
          'Better judgement about problems and the need for expert help.',
          'A guarantee that the original diagnosis was correct.',
        ],
        'C',
        '最后一段列出即使失败仍可获得的知识：描述问题、评估说法、判断何时需要专业帮助。',
        2,
      ),
    ],
  },
];

const practice = {
  id: 'practice-001',
  title: '六级全题型 · 原创练习',
  subtitle: 'Learning, community & everyday change',
  kind: 'practice',
  year: 2026,
  month: 9,
  set: 1,
  available: true,
  durationMinutes: 130,
  questionCount: 57,
  description: '原创示例卷，含完整题型、答案与解析。篇幅和难度未经真题等值校准。',
  source: { label: '本站原创 · 非历年真题', url: '' },
  sections: [
    {
      id: 'writing',
      title: '写作',
      durationMinutes: 30,
      groups: [
        {
          id: 'writing-task',
          title: 'Part I · Writing',
          instructions: 'Write an essay of 150 to 200 words in 30 minutes.',
          questions: [
            {
              id: 'writing-1',
              number: 56,
              type: 'text',
              weight: 15,
              prompt:
                'Some universities encourage students to take part in community projects alongside their academic studies. Write an essay discussing the value of learning through community participation. Give reasons and a specific example to support your view.',
              minWords: 150,
              maxWords: 200,
              keywords: [
                'community',
                'learning',
                'students',
                'experience',
                'participation',
                'skills',
              ],
              referenceAnswer: `Community participation can give university students a valuable opportunity to connect academic knowledge with the needs of other people. Although classroom study remains essential, practical involvement often raises questions that a textbook alone cannot answer.

One benefit is that students learn to adapt their knowledge to a particular situation. For example, a group organising a repair workshop may understand the technical problem but still need to explain it clearly to a beginner. Listening carefully and choosing accessible language become as important as finding the correct solution. Such experiences also reveal the limits of an initial plan. If local residents cannot attend during working hours, a well-designed activity may still fail.

These projects are most useful when students reflect on what happened. Universities should therefore combine participation with discussion rather than judge success only by the number of volunteer hours recorded. Students need time to examine their assumptions and consider what they would change.

In this way, community projects can deepen learning while encouraging a more responsible understanding of how knowledge is used.`,
              explanation:
                '参考结构：提出观点，说明知识应用与沟通能力，给出维修活动的具体例子，再讨论反思与改进。可采用不同立场和案例；评分应看任务回应、论证、组织及语言，不能靠关键词命中自动判定作文质量。',
            },
          ],
        },
      ],
    },
    { id: 'listening', title: '听力理解', durationMinutes: 30, groups: listeningGroups },
    { id: 'reading', title: '阅读理解', durationMinutes: 40, groups: readingGroups },
    {
      id: 'translation',
      title: '翻译',
      durationMinutes: 30,
      groups: [
        {
          id: 'translation-task',
          title: 'Part IV · Translation',
          instructions: 'Translate the following passage into English in 30 minutes.',
          questions: [
            {
              id: 'translation-1',
              number: 57,
              type: 'text',
              weight: 15,
              prompt:
                '近年来，许多城市开始重新思考公共图书馆的作用。除了提供图书借阅服务，一些图书馆还开设数字技能课程，帮助居民使用网上公共服务。为了让工作时间不同的人都能参加活动，图书馆尝试延长开放时间，并与社区组织合作了解居民的需要。这些变化并不意味着纸质图书已经失去价值，而是说明知识获取的方式正在变得更加多样。一个好的公共空间既应保存已有的资源，也应让不同年龄和背景的人感到自己受到欢迎。',
              keywords: [
                'library',
                'libraries',
                'public',
                'digital',
                'community',
                'knowledge',
                'resources',
              ],
              referenceAnswer:
                'In recent years, many cities have begun to reconsider the role of public libraries. In addition to lending books, some libraries offer courses in digital skills to help residents use online public services. To enable people with different working schedules to take part in activities, libraries have tried extending their opening hours and working with community organisations to understand local needs. These changes do not mean that printed books have lost their value. Rather, they show that ways of accessing knowledge are becoming more diverse. A good public space should both preserve existing resources and make people of different ages and backgrounds feel welcome.',
              explanation:
                '核对五层信息：重新思考图书馆作用；借书之外的数字课程；延长时间和社区合作；纸质书仍有价值与获取方式多样；保存资源并包容不同群体。注意“为了”目的结构、in addition to 后的动名词、make people feel welcome。参考译文不是唯一正确答案。',
            },
          ],
        },
      ],
    },
  ],
};

const past = (id, year, month, set, url, dateUrl) => ({
  id,
  title: `${year}年${month}月 · ${set === 0 ? '六级真题' : `第${set}套`}`,
  subtitle: 'CET-6 · 历年真题来源',
  kind: 'past',
  year,
  month,
  set,
  available: false,
  durationMinutes: 130,
  questionCount: 57,
  description: '真题来源目录。导入题目和答案后可在本站作答。',
  source: { label: '新东方 · 真题资料', url },
  dateSource: dateUrl,
  sections: [],
});

export const seedPapers = [
  practice,
  past(
    'cet6-2025-12',
    2025,
    12,
    0,
    'https://www.xdf.cn/1001/202512/15052565.html',
    'https://cet.neea.edu.cn/xhtml1/report/2509/26-1.htm',
  ),
  past(
    'cet6-2025-06-2',
    2025,
    6,
    2,
    'https://m.koolearn.com/cet6/20250609/901414.html',
    'https://cet.neea.edu.cn/html1/report/2503/19-1.htm',
  ),
  past(
    'cet6-2024-12-2',
    2024,
    12,
    2,
    'https://m.koolearn.com/cet6/20250415/898835.html',
    'https://cet.neea.edu.cn/html1/report/2409/8-1.htm',
  ),
  past(
    'cet6-2023-12',
    2023,
    12,
    2,
    'https://m.koolearn.com/cet6/20240229/884399.html',
    'https://cet.neea.edu.cn/html1/report/2309/7-1.htm',
  ),
];

export const seedDictionary = {
  accessible: {
    phonetic: '/əkˈsesəbəl/',
    definition: 'adj. 易到达的；可使用的；易理解的',
    example: 'The library is accessible to people with different mobility needs.',
  },
  appropriate: {
    phonetic: '/əˈprəʊpriət/',
    definition: 'adj. 适当的；合适的',
    example: 'Choose an appropriate method for your work.',
  },
  archive: {
    phonetic: '/ˈɑːkaɪv/',
    definition: 'n. 档案；档案库',
    example: 'Local memories can enrich an archive.',
  },
  barrier: {
    phonetic: '/ˈbæriə/',
    definition: 'n. 障碍；屏障',
    example: 'Opening hours can be a barrier to participation.',
  },
  bias: {
    phonetic: '/ˈbaɪəs/',
    definition: 'n. 偏差；偏见',
    example: 'A larger sample does not automatically remove bias.',
  },
  collaboration: {
    phonetic: '/kəˌlæbəˈreɪʃən/',
    definition: 'n. 合作；协作',
    example: 'Good documentation supports collaboration.',
  },
  community: {
    phonetic: '/kəˈmjuːnəti/',
    definition: 'n. 社区；群体',
    example: 'The project responds to the needs of the community.',
  },
  concentration: {
    phonetic: '/ˌkɒnsənˈtreɪʃən/',
    definition: 'n. 专注；集中',
    example: 'Complex work often requires concentration.',
  },
  confidence: {
    phonetic: '/ˈkɒnfɪdəns/',
    definition: 'n. 信心；自信',
    example: 'Learning a practical skill can build confidence.',
  },
  contradict: {
    phonetic: '/ˌkɒntrəˈdɪkt/',
    definition: 'v. 与……矛盾；反驳',
    example: 'Two accounts may contradict each other.',
  },
  conventional: {
    phonetic: '/kənˈvenʃənəl/',
    definition: 'adj. 传统的；常规的',
    example: 'The library combines conventional counts with visitor accounts.',
  },
  cooperation: {
    phonetic: '/kəʊˌɒpəˈreɪʃən/',
    definition: 'n. 合作；配合',
    example: 'Focused work still depends on cooperation.',
  },
  diverse: {
    phonetic: '/daɪˈvɜːs/',
    definition: 'adj. 多样的；不同的',
    example: 'Public services should respond to diverse needs.',
  },
  evidence: {
    phonetic: '/ˈevɪdəns/',
    definition: 'n. 证据；依据',
    example: 'Judge a conclusion on its evidence.',
  },
  flexible: {
    phonetic: '/ˈfleksəbəl/',
    definition: 'adj. 灵活的；可变通的',
    example: 'Shift workers need a flexible schedule.',
  },
  fragmented: {
    phonetic: '/fræɡˈmentɪd/',
    definition: 'adj. 碎片化的；分散的',
    example: 'Her day felt busy but fragmented.',
  },
  incentive: {
    phonetic: '/ɪnˈsentɪv/',
    definition: 'n. 激励；动机',
    example: 'The policy creates an incentive to remain available.',
  },
  independently: {
    phonetic: '/ˌɪndɪˈpendəntli/',
    definition: 'adv. 独立地；自主地',
    example: 'Visitors learn to repair items independently.',
  },
  interpretation: {
    phonetic: '/ɪnˌtɜːprɪˈteɪʃən/',
    definition: 'n. 解释；解读',
    example: 'Distinguish an observation from its interpretation.',
  },
  isolation: {
    phonetic: '/ˌaɪsəˈleɪʃən/',
    definition: 'n. 隔离；孤独状态',
    example: 'Community activities can reduce social isolation.',
  },
  measurable: {
    phonetic: '/ˈmeʒərəbəl/',
    definition: 'adj. 可衡量的；明显的',
    example: 'Look for measurable changes in what learners can do.',
  },
  obstacle: {
    phonetic: '/ˈɒbstəkəl/',
    definition: 'n. 障碍；阻碍',
    example: 'An inconvenient timetable may be the main obstacle.',
  },
  participation: {
    phonetic: '/pɑːˌtɪsɪˈpeɪʃən/',
    definition: 'n. 参与；参加',
    example: 'Community participation connects knowledge with experience.',
  },
  preserve: {
    phonetic: '/prɪˈzɜːv/',
    definition: 'v. 保存；保留；保护',
    example: 'Preserve the original files before processing data.',
  },
  reinforce: {
    phonetic: '/ˌriːɪnˈfɔːs/',
    definition: 'v. 加强；巩固',
    example: 'Explaining an idea can reinforce understanding.',
  },
  reliable: {
    phonetic: '/rɪˈlaɪəbəl/',
    definition: 'adj. 可靠的；可信赖的',
    example: 'A library provides reliable access to knowledge.',
  },
  repair: {
    phonetic: '/rɪˈpeə/',
    definition: 'v. 修理；修补；n. 维修',
    example: 'An unsuccessful repair can still provide useful knowledge.',
  },
  resource: {
    phonetic: '/rɪˈzɔːs/',
    definition: 'n. 资源；资料',
    example: 'Experience can be a valuable learning resource.',
  },
  retain: {
    phonetic: '/rɪˈteɪn/',
    definition: 'v. 保留；记住',
    example: 'Reviewing helps learners retain what they have learned.',
  },
  retrieve: {
    phonetic: '/rɪˈtriːv/',
    definition: 'v. 检索；提取；找回',
    example: 'Retrieve the main ideas from memory before reopening your notes.',
  },
  retrieval: {
    phonetic: '/rɪˈtriːvəl/',
    definition: 'n. 检索；提取；回忆',
    example: 'Retrieval exposes gaps that rereading may conceal.',
  },
  sequence: {
    phonetic: '/ˈsiːkwəns/',
    definition: 'n. 顺序；序列',
    example: 'Do not merely memorise a sequence of facts.',
  },
  serendipity: {
    phonetic: '/ˌserənˈdɪpəti/',
    definition: 'n. 意外发现美好事物的机缘；意外收获',
    example: 'A conversation at the library led to a moment of serendipity.',
  },
  structural: {
    phonetic: '/ˈstrʌktʃərəl/',
    definition: 'adj. 结构的；结构性的',
    example: 'Unavailable spare parts create a structural limit on repair.',
  },
  supervision: {
    phonetic: '/ˌsuːpəˈvɪʒən/',
    definition: 'n. 监督；指导',
    example: 'Electrical repairs require supervision.',
  },
  sustainable: {
    phonetic: '/səˈsteɪnəbəl/',
    definition: 'adj. 可持续的',
    example: 'Sharing rarely used tools can support sustainable consumption.',
  },
  uncertainty: {
    phonetic: '/ʌnˈsɜːtənti/',
    definition: 'n. 不确定性',
    example: 'Record uncertainty instead of hiding it.',
  },
  underestimate: {
    phonetic: '/ˌʌndərˈestɪmeɪt/',
    definition: 'v. 低估',
    example: 'Teachers may underestimate the knowledge adults bring.',
  },
  worthwhile: {
    phonetic: '/ˌwɜːθˈwaɪl/',
    definition: 'adj. 值得的；有价值的',
    example: 'Fewer interruptions should support worthwhile outcomes.',
  },
};
