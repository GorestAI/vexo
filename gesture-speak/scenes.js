// Ready-made phrase sets for a demo. Picking one fills the phrase boxes (one per table row,
// in table order: wave, roll, chin out, push, nod, twist, lift, swipe). A scene with a
// script also shows the lines of the other person, so a demo can be acted out step by step.
// `row` in a script step is the table row whose gesture answers that line.

export const SCENES = {
  basic: {
    title: 'Everyday phrases',
    phrases: ['Hello', 'How are you?', 'Thank you', 'Nice to meet you', 'Yes', 'No', 'Help me', 'Goodbye'],
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
      'Excuse me!',
      'Have a nice day!',
    ],
    script: [
      { they: '(You walk up to the counter.)', row: 0 },
      { they: 'What can I get you?', row: 1 },
      { they: 'Hot or iced?', row: 3 },
      { they: 'Anything else?', row: 5 },
      { they: "That's five dollars. Card is fine?", row: 4 },
      { they: 'Here you go, one hot latte!', row: 2 },
      { they: '(You turn to leave.)', row: 7 },
    ],
  },
};
