// Ready-made phrase sets for a demo. Picking one fills the phrase boxes (one per table row,
// in table order: up high, to mouth, on heart, palm up, thumb up, arm down, low palm out,
// to hip, then shake slow, medium, fast). A scene with a
// script also shows the lines of the other person, so a demo can be acted out step by step.
// `row` in a script step is the table row whose gesture answers that line.

export const SCENES = {
  basic: {
    title: 'Everyday phrases',
    phrases: ['Hello', 'How are you?', 'Thank you', 'Nice to meet you', 'Yes', 'No', "Sorry, I can't hear you.", 'Goodbye',
      'Wait a moment', 'Excuse me', 'Help me!'],
    script: null,
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
  },
};
