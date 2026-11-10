/** A backup file with one deck containing one question of every type (original text written for the tests). */
export function allTypesBackup(): string {
  const deckId = 'fixture-deck';
  const topicId = `${deckId}:t1`;
  const chunkId = `${deckId}:c0`;
  const text =
    'The water cycle moves water between the oceans, the air and the land. The sun heats water and it turns into vapour; this is called evaporation. Vapour cools and condenses into clouds. Rain, snow and hail are forms of precipitation. Water that flows over the ground is run-off. The formula for the area of a circle is $A = \\pi r^2$.';
  const base = {
    explanation: 'This is stated in the notes.',
    hint: 'Think about the sun.',
    difficulty: 1,
    topicId,
    sourceChunkIds: [chunkId],
    evidenceQuote: 'this is called evaporation',
  };
  const contents = [
    {
      ...base,
      type: 'mcq',
      prompt: 'What is it called when the sun turns water into vapour?',
      options: ['Evaporation', 'Condensation', 'Precipitation', 'Run-off'],
      answerIndex: 0,
    },
    {
      ...base,
      type: 'tf',
      prompt: 'Rain, snow and hail are forms of condensation.',
      answer: false,
      correction: 'Rain, snow and hail are forms of precipitation.',
    },
    {
      ...base,
      type: 'fill',
      prompt: 'Vapour cools and condenses into ____.',
      answer: 'clouds',
      acceptedAnswers: [],
    },
    { ...base, type: 'flashcard', prompt: 'Run-off', back: 'Water that flows over the ground.' },
    {
      ...base,
      type: 'match',
      prompt: 'Match each term to its meaning.',
      pairs: [
        { term: 'Evaporation', definition: 'Water turning into vapour' },
        { term: 'Condensation', definition: 'Vapour forming clouds' },
        { term: 'Precipitation', definition: 'Rain, snow or hail' },
        { term: 'Run-off', definition: 'Water flowing over the ground' },
      ],
    },
    {
      ...base,
      type: 'order',
      prompt: 'Put the steps of the water cycle in order.',
      steps: [
        'The sun heats water',
        'Water evaporates',
        'Vapour condenses into clouds',
        'Precipitation falls',
      ],
    },
    {
      ...base,
      type: 'explain',
      prompt: 'Explain how clouds form. What is the area of a circle with radius $r$?',
      modelAnswer: 'Vapour rises, cools and condenses into clouds; $A = \\pi r^2$.',
      keyPoints: ['Water evaporates', 'Vapour cools', 'Vapour condenses into clouds'],
    },
  ];
  const now = Date.UTC(2026, 10, 1);
  return JSON.stringify({
    app: 'studynight',
    format: 1,
    exportedAt: new Date(now).toISOString(),
    data: {
      decks: [
        {
          id: deckId,
          title: 'Water cycle',
          createdAt: now,
          updatedAt: now,
          lastPlayedAt: null,
          quizLanguage: 'en',
          notesLanguage: 'en',
          examDate: null,
          status: 'ready',
          stage: 'done',
          errorCode: null,
          embedState: 'none',
          bestSuddenDeath: 0,
          sampleId: null,
        },
      ],
      sources: [
        { id: 'src', deckId, name: 'water-cycle.pdf', kind: 'pdf', units: 3, bytes: 1000, addedAt: now },
      ],
      chunks: [
        {
          id: chunkId,
          deckId,
          index: 0,
          text,
          headingPath: ['The water cycle'],
          refs: [{ sourceId: 'src', page: 2, headingPath: [] }],
          wordCount: 60,
        },
      ],
      images: [],
      topics: [
        {
          id: topicId,
          deckId,
          key: 't1',
          order: 0,
          title: 'The water cycle',
          summary: 'How water moves.',
          chunkIds: [chunkId],
          skill: 1.5,
          status: 'exhausted',
          emptyRounds: 3,
        },
      ],
      questions: contents.map((content, i) => ({
        id: `q${i}`,
        deckId,
        topicId,
        content,
        createdAt: now,
        reported: null,
      })),
      cardStates: [],
      reviews: [],
      sessions: [],
      profile: {
        id: 'me',
        nickname: 'Sam',
        avatar: 3,
        mascotTheme: 0,
        createdAt: now,
        xp: 420,
        dailyGoalMinutes: 10,
        streak: { current: 4, best: 9, lastDay: null, freezes: 1, frozenDays: [] },
        stats: { questionsAnswered: 40, correctAnswers: 31 },
        onboarded: true,
      },
      badges: [{ id: 'firstDeck', earnedAt: now }],
      exams: [{ id: 'exam1', deckId, title: 'Geography', date: '2099-06-01', createdAt: now }],
      settings: [],
      days: [],
    },
  });
}
