export interface TriviaQuestion {
  prompt: string;
  choices: [string, string, string, string];
  answer: 0 | 1 | 2 | 3;
}

export const QUESTIONS: TriviaQuestion[] = [
  {
    prompt: "How many legs does a spider have?",
    choices: ["6", "8", "10", "4"],
    answer: 1,
  },
  {
    prompt: "Which planet is known as the Red Planet?",
    choices: ["Venus", "Jupiter", "Mars", "Saturn"],
    answer: 2,
  },
  {
    prompt: "How many days are in a leap year?",
    choices: ["365", "366", "364", "360"],
    answer: 1,
  },
  {
    prompt: "What do honeybees make that people eat?",
    choices: ["Honey", "Silk", "Milk", "Maple syrup"],
    answer: 0,
  },
  {
    prompt: "Which ocean is the largest?",
    choices: ["Atlantic", "Indian", "Arctic", "Pacific"],
    answer: 3,
  },
  {
    prompt: "How many sides does a triangle have?",
    choices: ["4", "5", "3", "6"],
    answer: 2,
  },
  {
    prompt: "What is the capital of France?",
    choices: ["London", "Paris", "Rome", "Madrid"],
    answer: 1,
  },
  {
    prompt: "Water freezes at what temperature Fahrenheit?",
    choices: ["0°", "32°", "100°", "212°"],
    answer: 1,
  },
  {
    prompt: "How many continents are there?",
    choices: ["5", "6", "7", "8"],
    answer: 2,
  },
  {
    prompt: "Which gas do plants take in from the air?",
    choices: ["Oxygen", "Helium", "Carbon dioxide", "Hydrogen"],
    answer: 2,
  },
  {
    prompt: "Which sport is played with a puck?",
    choices: ["Soccer", "Tennis", "Hockey", "Golf"],
    answer: 2,
  },
  {
    prompt: "How many hours are in one day?",
    choices: ["12", "24", "36", "48"],
    answer: 1,
  },
  {
    prompt: "What is a baby dog called?",
    choices: ["Kitten", "Calf", "Cub", "Puppy"],
    answer: 3,
  },
  {
    prompt: "Which of these is a fruit?",
    choices: ["Carrot", "Broccoli", "Strawberry", "Potato"],
    answer: 2,
  },
  {
    prompt: "How many wheels does a typical bicycle have?",
    choices: ["1", "2", "3", "4"],
    answer: 1,
  },
  {
    prompt: "What is the tallest mountain on Earth?",
    choices: ["Kilimanjaro", "Denali", "Everest", "Matterhorn"],
    answer: 2,
  },
  {
    prompt: "Which season comes right after winter?",
    choices: ["Spring", "Summer", "Fall", "Monsoon"],
    answer: 0,
  },
  {
    prompt: "What do you call a group of lions?",
    choices: ["Pack", "Herd", "Flock", "Pride"],
    answer: 3,
  },
  {
    prompt: "How many letters are in the English alphabet?",
    choices: ["24", "25", "26", "27"],
    answer: 2,
  },
  {
    prompt: "Which instrument has black and white keys?",
    choices: ["Violin", "Piano", "Drum", "Flute"],
    answer: 1,
  },
  {
    prompt: "What is H2O more commonly called?",
    choices: ["Salt", "Sugar", "Water", "Air"],
    answer: 2,
  },
  {
    prompt: "Which country is shaped like a boot?",
    choices: ["Spain", "Greece", "Italy", "Portugal"],
    answer: 2,
  },
  {
    prompt: "How many players from one team are on a baseball field?",
    choices: ["7", "9", "11", "5"],
    answer: 1,
  },
  {
    prompt: "What color do you get by mixing red and yellow?",
    choices: ["Green", "Purple", "Brown", "Orange"],
    answer: 3,
  },
  {
    prompt: "Which planet is closest to the Sun?",
    choices: ["Venus", "Earth", "Mercury", "Mars"],
    answer: 2,
  },
  {
    prompt: "What is the main ingredient in guacamole?",
    choices: ["Tomato", "Avocado", "Corn", "Black beans"],
    answer: 1,
  },
  {
    prompt: "How many minutes are in an hour?",
    choices: ["30", "60", "90", "100"],
    answer: 1,
  },
  {
    prompt: "Which of these animals can truly fly?",
    choices: ["Penguin", "Ostrich", "Bat", "Dolphin"],
    answer: 2,
  },
  {
    prompt: "What is the hardest natural substance?",
    choices: ["Gold", "Iron", "Quartz", "Diamond"],
    answer: 3,
  },
  {
    prompt: "Which holiday is famous for jack-o'-lanterns?",
    choices: ["Christmas", "Halloween", "Easter", "Thanksgiving"],
    answer: 1,
  },
  {
    prompt: "How many sides does a stop sign have?",
    choices: ["6", "8", "4", "5"],
    answer: 1,
  },
  {
    prompt: "What force pulls objects toward Earth?",
    choices: ["Magnetism", "Friction", "Gravity", "Wind"],
    answer: 2,
  },
  {
    prompt: "What is the capital of Japan?",
    choices: ["Seoul", "Beijing", "Tokyo", "Bangkok"],
    answer: 2,
  },
  {
    prompt: "A decade is how many years?",
    choices: ["5", "10", "20", "100"],
    answer: 1,
  },
  {
    prompt: "Which of these is a mammal?",
    choices: ["Shark", "Frog", "Whale", "Trout"],
    answer: 2,
  },
  {
    prompt: "How many zeros are in one thousand?",
    choices: ["2", "3", "4", "6"],
    answer: 1,
  },
  {
    prompt: "What do caterpillars turn into?",
    choices: ["Frogs", "Birds", "Butterflies", "Fish"],
    answer: 2,
  },
  {
    prompt: "Which ocean is on the west coast of the United States?",
    choices: ["Atlantic", "Pacific", "Indian", "Arctic"],
    answer: 1,
  },
  {
    prompt: "What is 12 times 12?",
    choices: ["124", "144", "132", "112"],
    answer: 1,
  },
  {
    prompt: "Which planet is famous for its rings?",
    choices: ["Mars", "Venus", "Saturn", "Mercury"],
    answer: 2,
  },
  {
    prompt: "What is the largest planet in our solar system?",
    choices: ["Earth", "Saturn", "Neptune", "Jupiter"],
    answer: 3,
  },
  {
    prompt: "How many innings are in a standard baseball game?",
    choices: ["7", "8", "9", "10"],
    answer: 2,
  },
  {
    prompt: "Which sense uses your ears?",
    choices: ["Sight", "Hearing", "Taste", "Smell"],
    answer: 1,
  },
  {
    prompt: "What is frozen water called?",
    choices: ["Steam", "Dew", "Ice", "Fog"],
    answer: 2,
  },
  {
    prompt: "Which of these states touches Lake Michigan?",
    choices: ["Iowa", "Michigan", "Missouri", "Kentucky"],
    answer: 1,
  },
  {
    prompt: "How many legs does an insect usually have?",
    choices: ["4", "6", "8", "10"],
    answer: 1,
  },
  {
    prompt: "What color is a typical emerald?",
    choices: ["Blue", "Red", "Green", "Yellow"],
    answer: 2,
  },
  {
    prompt: "How many players from one team are on a basketball court?",
    choices: ["4", "5", "6", "7"],
    answer: 1,
  },
  {
    prompt: "Which bird is a symbol of the United States?",
    choices: ["Bald eagle", "Penguin", "Ostrich", "Parrot"],
    answer: 0,
  },
  {
    prompt: "What do you call molten rock that has reached the surface?",
    choices: ["Magma", "Lava", "Granite", "Slate"],
    answer: 1,
  },
];
