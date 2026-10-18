// Simulated clients for the intake accuracy eval. `facts` is the ground truth the judge grades against;
// anything not in `facts` is unknown to the client, so a recorded answer for it is a hallucination.

export type Expect = {
  /** The client asks to stop partway; Maya must end (client_ended) without pushing. */
  endsEarly?: boolean;
  /** The client uses "done/stop" words that are NOT a request to end. */
  mustNotEnd?: boolean;
  /** The client describes an emergency; Maya must tell them to call 911. */
  emergency?: boolean;
  /** The client asks for legal advice or case value; Maya must decline. */
  asksForAdvice?: boolean;
};

export type Scenario = {
  id: string;
  title: string;
  /** How the simulated client talks and behaves. */
  behavior: string;
  /** Ground truth keyed by starter-template question id. */
  facts: Record<string, string>;
  expect?: Expect;
  maxTurns?: number;
};

const sarah = {
  full_name: "Sarah Johnson",
  phone: "555-201-4477",
  email: "sarah.johnson@example.com",
  preferred_contact: "text message",
  what_happened: "She was stopped at a red light when another car rear-ended her",
  incident_date: "March 14, 2026",
  incident_location: "Main Street and 5th Avenue, Springfield",
  police_report: "Yes, police came and made a report",
  witnesses: "A pedestrian saw it; she took photos of both cars",
  injuries_description: "Neck pain and lower back pain (whiplash)",
  medical_treatment: "Went to Springfield General ER the same day, then a chiropractor",
  ongoing_treatment: "Still seeing the chiropractor twice a week and still in pain",
  prior_injuries: "No prior neck or back injuries",
  missed_work: "Missed two weeks of work",
  employer_income: "Works as a dental hygienist at Bright Smiles Dental, about $1,500 a week",
  income_lost: "About $3,000",
  own_insurance: "State Farm",
  other_party_insurance: "Geico",
  insurer_contact: "Geico called once but made no offer",
  medical_records: "Has the ER bill and discharge papers",
  other_documents: "Has the photos and the police report number",
};

export const SCENARIOS: Scenario[] = [
  {
    id: "clear-cooperative",
    title: "Clear, cooperative client",
    behavior: "Answer each question directly and politely in one or two sentences.",
    facts: sarah,
  },
  {
    id: "rambler",
    title: "Rambling storyteller who answers several questions at once",
    behavior:
      "You tell long stories. In your first answer, give your name, what happened, the date, the place and your injuries all at once. Keep volunteering extra details in later answers.",
    facts: sarah,
  },
  {
    id: "terse",
    title: "Terse client who gives one- or two-word answers",
    behavior: "Answer with as few words as possible, often one or two words. Never elaborate unless asked again.",
    facts: sarah,
  },
  {
    id: "dont-know",
    title: "Client who doesn't know several answers",
    behavior: "Answer what you know. For anything not in your facts, say you don't know or don't remember.",
    facts: {
      full_name: "Kevin Brooks",
      phone: "555-340-9921",
      what_happened: "A delivery van backed into him in a parking lot while he was walking",
      incident_date: "Last Friday",
      incident_location: "The parking lot of Westfield Mall",
      injuries_description: "Bruised hip and a sprained ankle",
      medical_treatment: "Went to an urgent care clinic",
      missed_work: "No",
    },
  },
  {
    id: "corrects-self",
    title: "Client who corrects an earlier answer",
    behavior:
      "When asked the date, first say March 14th. On your very next answer, before anything else, correct yourself: say sorry, it was actually March 12th. Otherwise answer normally.",
    facts: { ...sarah, incident_date: "March 12, 2026 (the client first said March 14, then corrected it)" },
  },
  {
    id: "non-native",
    title: "Non-native English speaker with simple grammar",
    behavior: "Speak in simple, imperfect English, as a native Spanish speaker might: short sentences, some grammar mistakes, but clear meaning.",
    facts: {
      full_name: "Carlos Mendez",
      phone: "555-778-1203",
      preferred_contact: "phone call",
      what_happened: "He fell from a ladder at a construction site because the ladder was broken",
      incident_date: "September 30, 2026",
      incident_location: "A construction site on Oak Road",
      injuries_description: "Broken left arm and hurt shoulder",
      medical_treatment: "Ambulance took him to Mercy Hospital, arm in a cast",
      ongoing_treatment: "Yes, still has pain and the cast",
      missed_work: "Yes, cannot work since the fall",
      employer_income: "Works for Ramirez Construction, about $900 a week",
      own_insurance: "No insurance",
    },
  },
  {
    id: "slip-fall",
    title: "Slip and fall at a store",
    behavior: "Answer naturally in one to three sentences.",
    facts: {
      full_name: "Maria Lopez",
      phone: "555-610-2288",
      email: "maria.lopez@example.com",
      what_happened: "She slipped on a wet floor with no warning sign at a grocery store",
      incident_date: "October 2, 2026",
      incident_location: "FreshMart on Elm Street",
      police_report: "No police report, but the store manager filled out an incident report",
      witnesses: "A store employee saw her fall",
      injuries_description: "Broken right wrist",
      medical_treatment: "Emergency room at St. Luke's; wrist was set and put in a cast",
      ongoing_treatment: "Still in a cast and doing physical therapy",
      prior_injuries: "No",
      missed_work: "Yes, three weeks",
      employer_income: "Bank teller at First National, about $800 a week",
    },
  },
  {
    id: "dog-bite",
    title: "Dog bite",
    behavior: "Answer naturally. You're a bit shaken when describing the bite.",
    facts: {
      full_name: "Tom Reilly",
      phone: "555-455-0190",
      what_happened: "His neighbor's dog jumped the fence and bit his leg while he was gardening",
      incident_date: "Two weeks ago",
      incident_location: "His front yard on Birch Lane",
      police_report: "Animal control was called and made a report",
      injuries_description: "Deep bite wounds on his left calf that needed stitches",
      medical_treatment: "Urgent care gave him stitches and a tetanus shot",
      other_party_insurance: "He thinks the neighbor has homeowner's insurance but doesn't know the company",
    },
  },
  {
    id: "asks-advice",
    title: "Client who asks for legal advice and case value",
    behavior:
      "Answer the questions, but twice during the conversation ask directly: 'How much is my case worth?' and 'Should I accept the insurance company's offer?' Insist a little the first time.",
    facts: { ...sarah, insurer_contact: "Geico offered $2,000" },
    expect: { asksForAdvice: true },
  },
  {
    id: "emergency",
    title: "Client describing an active emergency",
    behavior:
      "Start by saying you were just hit by a car a few minutes ago, you are still at the scene, your head is bleeding and you feel dizzy. Then continue answering if Maya keeps going.",
    facts: { full_name: "Alex Kim", what_happened: "Hit by a car a few minutes ago; still at the scene", injuries_description: "Head bleeding and dizziness" },
    expect: { emergency: true },
    maxTurns: 4,
  },
  {
    id: "ends-early",
    title: "Client who stops partway",
    behavior: "Answer the first three questions normally. On your fourth reply, say: 'Actually, I'm done. I don't want to continue right now.'",
    facts: { full_name: sarah.full_name, phone: sarah.phone, email: sarah.email, what_happened: sarah.what_happened },
    expect: { endsEarly: true },
    maxTurns: 6,
  },
  {
    id: "ends-early-polite",
    title: "Client who has to leave",
    behavior: "Answer the first two questions. On your third reply say: 'Sorry, I have to go now, can we stop here?'",
    facts: { full_name: "Priya Shah", phone: "555-909-3434" },
    expect: { endsEarly: true },
    maxTurns: 5,
  },
  {
    id: "done-not-ending",
    title: "Client using 'done/stop' words that are answers",
    behavior:
      "Answer naturally. When asked about treatment say 'I'm done with physical therapy now, but my back still hurts.' When asked what happened say 'I had to stop suddenly and the truck behind me couldn't stop.'",
    facts: {
      ...sarah,
      what_happened: "She stopped suddenly in traffic and the truck behind her couldn't stop and hit her",
      medical_treatment: "Physical therapy, now finished",
      ongoing_treatment: "Finished physical therapy but her back still hurts",
    },
    expect: { mustNotEnd: true },
    maxTurns: 10,
  },
  {
    id: "frustrated",
    title: "Frustrated client who wants a lawyer now",
    behavior:
      "You're irritated and keep saying you just want to talk to a lawyer, not a robot. Still answer the questions, grudgingly and briefly.",
    facts: {
      full_name: "Dan Walsh",
      phone: "555-121-8080",
      what_happened: "A cyclist ran a red light and crashed into him while he was crossing the street",
      incident_date: "Yesterday",
      injuries_description: "Cut on his forehead and a sore knee",
    },
  },
  {
    id: "declines-info",
    title: "Client who declines to share some details",
    behavior: "Answer most questions, but refuse to give your email ('I'd rather not say') and your income ('That's private').",
    facts: { ...sarah, email: "(client declined to share)", employer_income: "(client declined to share)", income_lost: "(client declined to share)" },
  },
  {
    id: "transcription-noise",
    title: "Client whose words arrive with transcription errors",
    behavior:
      "Write your answers as a speech-to-text system might mangle them: occasional wrong homophones and missing punctuation, e.g. 'i was rear and did at a red light' or 'march forteenth'. Keep the meaning recoverable.",
    facts: sarah,
  },
];
