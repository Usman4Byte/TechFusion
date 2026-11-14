/**
 * Plain-language background for each test. The lab files only give names,
 * ranges and limits, so this short general-health wording is used to explain
 * what a test measures. It never says the patient has a disease.
 */
export interface TestInfo {
  measures: string;
  low: string;
  high: string;
  organ: "blood" | "liver" | "kidney" | "thyroid" | "sugar" | "heart" | "urine" | "other";
}

export const TEST_INFO: Record<string, TestInfo> = {
  hemoglobin: {
    measures: "Hemoglobin is the part of red blood cells that carries oxygen around the body.",
    low: "A low level can mean the blood is carrying less oxygen than usual, which can make a person feel tired or weak.",
    high: "A high level can happen when the body is low on water or for other reasons a doctor can check.",
    organ: "blood",
  },
  whitebloodcellcount: {
    measures: "White blood cells are the body's defence cells. They help fight germs.",
    low: "A low count can mean the body has fewer defence cells than usual.",
    high: "A high count often shows the body is reacting to something, such as an infection or stress.",
    organ: "blood",
  },
  plateletcount: {
    measures: "Platelets are tiny cells that help blood clot and stop bleeding.",
    low: "A low count can mean the blood may not clot as easily, so bruises or bleeding can happen more easily.",
    high: "A high count can mean the body is making more platelets than usual.",
    organ: "blood",
  },
  redbloodcellcount: {
    measures: "Red blood cells carry oxygen from the lungs to the rest of the body.",
    low: "A low count can mean less oxygen is being carried.",
    high: "A high count can happen for several reasons a doctor can check.",
    organ: "blood",
  },
  fastingbloodsugar: {
    measures: "Fasting blood sugar shows how much sugar (glucose) is in the blood after not eating for some hours.",
    low: "A low level means there is less sugar in the blood than usual, which can make a person shaky or dizzy.",
    high: "A high level means there is more sugar in the blood than usual after fasting.",
    organ: "sugar",
  },
  alt: {
    measures: "ALT (also called SGPT) is a substance made mostly in the liver.",
    low: "A low ALT is usually not a worry, but a doctor can explain it.",
    high: "A high ALT can mean the liver is under some stress or strain.",
    organ: "liver",
  },
  ast: {
    measures: "AST (also called SGOT) is a substance found in the liver, heart and muscles.",
    low: "A low AST is usually not a worry, but a doctor can explain it.",
    high: "A high AST can mean the liver or muscles are under some stress.",
    organ: "liver",
  },
  cholesterol: {
    measures: "Cholesterol is a type of fat in the blood. The body needs some, but too much can build up in blood vessels.",
    low: "A low level is less common. A doctor can explain what it means for you.",
    high: "A high level means there is more fat in the blood than the normal range.",
    organ: "heart",
  },
  tsh: {
    measures: "TSH is a signal hormone that tells the thyroid gland in the neck how hard to work.",
    low: "A low TSH can mean the thyroid is working faster than usual.",
    high: "A high TSH can mean the thyroid is working slower than usual.",
    organ: "thyroid",
  },
  urineph: {
    measures: "Urine pH shows how acidic or basic the urine is.",
    low: "A low pH means the urine is more acidic than usual.",
    high: "A high pH means the urine is less acidic than usual.",
    organ: "urine",
  },
  urineprotein: {
    measures: "This checks if there is protein in the urine. Normally there is none or almost none.",
    low: "",
    high: "Finding protein can mean the kidneys are letting protein pass into the urine.",
    organ: "kidney",
  },
};

export function infoFor(canonical: string | null): TestInfo | null {
  if (!canonical) return null;
  return TEST_INFO[canonical.toLowerCase().replace(/[^a-z0-9]/g, "")] ?? null;
}
