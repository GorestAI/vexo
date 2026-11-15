// Ready-made phrase sets for a demo. Picking one fills the phrase boxes (one per table row,
// in table order: up high, to mouth, on heart, palm up, thumb up, arm down, low palm out,
// to hip, then shake slow, medium, fast). A scene with a
// script also shows the lines of the other person, so a demo can be acted out step by step.
// `row` in a script step is the table row whose gesture answers that line.
//
// `rhythm` is the same for the shake rhythm, where nothing is taught: four phrases for
// slow shake, fast shake, slow x2 and fast x2, and a script whose `cmd` is one of those four.
//
// `draw` is the same for shapes drawn in the air: a phrase for each simple shape (shapes.js),
// and a script whose line is answered by a `shape`, by `ai: true` (draw anything, the AI
// guesses it; `hint` says what to try) or by a shake on the band (`cmd`, as above).

export const SCENES = {
  basic: {
    title: 'Everyday phrases',
    phrases: ['Hello', 'How are you?', 'Thank you', 'Nice to meet you', 'Yes', 'No', "Sorry, I can't hear you.", 'Goodbye',
      'Wait a moment', 'Excuse me', 'Help me!'],
    script: null,
    rhythm: {
      phrases: ['Yes', 'No', "Sorry, I can't hear you. Please type or point.", 'Help me, please!'],
      script: null,
    },
    draw: {
      phrases: {
        circle: "Hi! I'm deaf. I read what you say on my screen.", check: 'Yes', line: 'No',
        question: 'Sorry, could you say that again?', heart: 'Thank you!',
      },
      script: null,
    },
  },
  cafe: {
    title: 'Ordering a coffee',
    phrases: [
      "Hi, I'd like to order.",
      'A latte, please.',
      'Thank you so much!',
      'Hot, please.',
      "Yes, I'll pay by card.",
      "No, that's all.",
      "Sorry, I can't hear you. Could you point to it on the menu?",
      'Have a nice day!',
      'Hmm, let me think...',
      'Less sugar, please.',
      "Could you hurry? I'm running late!",
    ],
    script: [
      { they: '(You walk up to the counter.)', row: 0 },
      { they: 'Would you like to try our new seasonal special today?', row: 6 },
      { they: '(Points at the menu.) What can I get you?', row: 8 },
      { they: '(Take your time.)', row: 1 },
      { they: 'Hot or iced?', row: 3 },
      { they: 'Any sugar?', row: 9 },
      { they: 'Anything else?', row: 5 },
      { they: "That's five dollars. Card is fine?", row: 4 },
      { they: 'It will be about ten minutes.', row: 10 },
      { they: 'Here you go, one hot latte!', row: 2 },
      { they: '(You turn to leave.)', row: 7 },
    ],
    rhythm: {
      phrases: ['Yes, please.', 'No, thank you.', "Hi! I'm deaf, but I can read what you say here.", 'A hot latte, please.'],
      script: [
        { they: '(You walk up to the counter.)', cmd: 2 },
        { they: 'Oh, okay! What can I get you?', cmd: 3 },
        { they: 'Any sugar?', cmd: 1 },
        { they: 'Is it for here?', cmd: 0 },
        { they: "That's five dollars. Card is fine?", cmd: 0 },
      ],
    },
    draw: {
      phrases: {
        circle: "Hi! I'm deaf, but I can read what you say here.", check: 'Yes, please.', line: 'No, thank you.',
        question: 'Sorry, could you say that again?', heart: 'Thank you so much!',
      },
      script: null,
    },
  },
  date: {
    title: 'Date night: telling them you like them',
    phrases: [
      "Hi! I'm deaf, so I read what you say on my screen.", 'You look amazing tonight.', "I'm having a great time with you.",
      'Sorry, could you say that again?', 'Yes!', 'No, not at all.', 'Will you go out with me?', 'I really like you.',
      'Haha, that is so funny!', 'Tell me more!', 'Me too!',
    ],
    script: null,
    rhythm: {
      phrases: ['Yes!', 'No, not at all.', "Hi! I'm deaf, so I read what you say on my screen.", 'Will you go out with me?'],
      script: [
        { they: '(You sit down across from your date.)', cmd: 2 },
        { they: 'Oh, cool! Are you having fun so far?', cmd: 0 },
        { they: 'Do you want to call it a night?', cmd: 1 },
        { they: '(A quiet moment.)', cmd: 3 },
      ],
    },
    draw: {
      phrases: {
        circle: "Hi! I'm deaf, so I read what you say on my screen.", check: 'Yes!', line: 'No, not at all.',
        question: 'Sorry, could you say that again?', heart: 'I really like you.',
      },
      script: [
        { they: '(You sit down across from your date.)', shape: 'circle' },
        { they: 'Oh, okay! Nice to meet you. You look great tonight.', ai: true, hint: 'Draw anything, the AI guesses: a star?' },
        { they: '(The music is loud.) ...did you catch that?', shape: 'question' },
        { they: 'I asked: are you having fun?', shape: 'check' },
        { they: 'Do you want to leave already?', shape: 'line' },
        { they: 'So what do you like to do on weekends?', ai: true, hint: 'Draw it, the AI guesses: a mountain? a film?' },
        { they: '(A quiet moment.)', shape: 'heart' },
        { they: 'I really like you too!', cmd: 3 },
      ],
    },
  },
};
