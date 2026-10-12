// Appointment types as grouped on HealthHub's "Select service type" page, each
// with the polyclinics its "Select location" page offered on 12 Oct 2026.
// A type with no polyclinics cannot be searched and is shown greyed out; a
// `note` is shown as a tooltip beside the type.
const polyclinics = (names) => names.split(', ').map((name) => `${name} Polyclinic`);

const APPOINTMENT_GROUPS = [
  {
    name: "Doctor Consultation",
    types: [
      {
        name: "Doctor Consultation",
        locations: polyclinics("Ang Mo Kio, Bedok, Bukit Batok, Bukit Merah, Bukit Panjang, Choa Chu Kang, Clementi, Eunos, Geylang, Hougang, Jurong, Kallang, Khatib, Marine Parade, Outram, Pasir Ris, Pioneer, Punggol, Queenstown, Sembawang, Sengkang, Serangoon, Tampines North, Tampines, Tengah, Toa Payoh, Woodlands, Yishun"),
        note: "Some polyclinics ask about your symptoms before showing slots. The panel then hands the page to you for up to 3 minutes, and skips that polyclinic if the question is left unanswered.",
      },
    ],
  },
  {
    name: "Healthier SG",
    types: [
      {
        name: "Health Plan Discussion",
        locations: polyclinics("Ang Mo Kio, Bukit Batok, Bukit Panjang, Choa Chu Kang, Clementi, Geylang, Hougang, Jurong, Kallang, Khatib, Pioneer, Queenstown, Sembawang, Serangoon, Tengah, Toa Payoh, Woodlands, Yishun"),
      },
      {
        name: "Healthier@SG Consult",
        locations: polyclinics("Bedok, Bukit Merah, Eunos, Marine Parade, Outram, Pasir Ris, Punggol, Sengkang, Tampines North, Tampines"),
      },
    ],
  },
  {
    name: "Video Consultation (via Zoom) For patients age 18 and above only",
    types: [
      {
        name: "Doctor Consult for General Conditions (SingHealth Polyclinics)",
        locations: [],
        note: "Cannot be searched: HealthHub offers no location or date to choose before its “Next” button, which this tool never presses.",
      },
      {
        name: "Chronic Conditions and Family Planning Follow-up",
        locations: polyclinics("Bedok, Bukit Merah, Eunos, Marine Parade, Outram, Pasir Ris, Punggol, Sengkang, Tampines North, Tampines"),
      },
    ],
  },
  {
    name: "Nursing",
    types: [
      {
        name: "Adult Vaccination (Excludes Flu Vaccination)",
        locations: polyclinics("Bukit Batok, Bukit Panjang, Choa Chu Kang, Clementi, Jurong, Pioneer, Queenstown, Tengah"),
      },
      {
        name: "Vaccination Clinic (7 years and above)",
        locations: polyclinics("Ang Mo Kio, Geylang, Hougang, Kallang, Khatib, Sembawang, Serangoon, Toa Payoh, Woodlands, Yishun"),
      },
      {
        name: "Postnatal Care",
        locations: polyclinics("Bukit Batok, Bukit Panjang, Choa Chu Kang, Clementi, Jurong, Pioneer, Queenstown, Tengah"),
      },
      {
        name: "Advanced Practice Nurse (For Existing APN Patients)",
        locations: polyclinics("Bedok, Eunos, Marine Parade, Outram, Pasir Ris, Punggol, Sengkang, Tampines North, Tampines"),
      },
      {
        name: "Child Vaccination (Age 6 Months to 17 Years)",
        locations: polyclinics("Bukit Batok, Bukit Panjang, Choa Chu Kang, Clementi, Jurong, Pioneer, Queenstown, Tengah"),
      },
      {
        name: "COVID Vaccination (Age 12 Years & above)",
        locations: polyclinics("Ang Mo Kio, Bedok, Bukit Batok, Bukit Merah, Bukit Panjang, Choa Chu Kang, Clementi, Eunos, Geylang, Hougang, Jurong, Kallang, Khatib, Marine Parade, Outram, Pasir Ris, Pioneer, Punggol, Queenstown, Sembawang, Sengkang, Serangoon, Tampines North, Tampines, Tengah, Toa Payoh, Woodlands, Yishun"),
      },
      {
        name: "COVID Vaccination (Age 5 to 11 Years)",
        locations: polyclinics("Ang Mo Kio, Bedok, Bukit Batok, Bukit Merah, Bukit Panjang, Choa Chu Kang, Clementi, Eunos, Geylang, Hougang, Jurong, Kallang, Khatib, Marine Parade, Outram, Pasir Ris, Pioneer, Punggol, Queenstown, Sembawang, Sengkang, Serangoon, Tampines North, Tampines, Tengah, Toa Payoh, Woodlands, Yishun"),
      },
      {
        name: "COVID Vaccination (Age 6 Months to 4 Years)",
        locations: polyclinics("Ang Mo Kio, Bedok, Bukit Batok, Bukit Merah, Bukit Panjang, Choa Chu Kang, Clementi, Eunos, Geylang, Hougang, Jurong, Kallang, Khatib, Marine Parade, Outram, Pasir Ris, Pioneer, Punggol, Queenstown, Sembawang, Sengkang, Serangoon, Tampines North, Tampines, Tengah, Toa Payoh, Woodlands, Yishun"),
      },
      {
        name: "Dressing",
        locations: polyclinics("Ang Mo Kio, Bukit Batok, Bukit Panjang, Choa Chu Kang, Clementi, Geylang, Hougang, Jurong, Kallang, Khatib, Pioneer, Queenstown, Sembawang, Serangoon, Tengah, Toa Payoh, Woodlands, Yishun"),
      },
      {
        name: "Flu Vaccination",
        locations: polyclinics("Bedok, Bukit Batok, Bukit Merah, Bukit Panjang, Choa Chu Kang, Clementi, Eunos, Jurong, Marine Parade, Outram, Pasir Ris, Pioneer, Punggol, Queenstown, Sengkang, Tampines North, Tampines, Tengah"),
      },
    ],
  },
  {
    name: "Screening",
    types: [
      {
        name: "Cervical Cancer Screening",
        locations: polyclinics("Ang Mo Kio, Bedok, Bukit Batok, Bukit Merah, Bukit Panjang, Choa Chu Kang, Clementi, Eunos, Geylang, Hougang, Jurong, Kallang, Khatib, Marine Parade, Outram, Pasir Ris, Pioneer, Punggol, Queenstown, Sembawang, Sengkang, Serangoon, Tampines North, Tampines, Tengah, Toa Payoh, Woodlands, Yishun"),
      },
      {
        name: "Bone Mineral Densitometry (BMD)",
        locations: polyclinics("Ang Mo Kio, Geylang, Kallang, Serangoon, Woodlands, Yishun"),
      },
      {
        name: "Childhood Developmental Screening",
        locations: polyclinics("Ang Mo Kio, Bukit Batok, Bukit Panjang, Choa Chu Kang, Clementi, Geylang, Hougang, Jurong, Kallang, Khatib, Pioneer, Queenstown, Sembawang, Serangoon, Tengah, Toa Payoh, Woodlands, Yishun"),
      },
      {
        name: "Driving Licence Medical Examination",
        locations: polyclinics("Ang Mo Kio, Hougang, Kallang, Khatib, Sembawang, Serangoon, Woodlands, Yishun"),
      },
      {
        name: "Diabetic Eye Screening",
        locations: polyclinics("Ang Mo Kio, Bukit Batok, Bukit Panjang, Choa Chu Kang, Clementi, Geylang, Hougang, Jurong, Kallang, Khatib, Pioneer, Queenstown, Sembawang, Serangoon, Tengah, Toa Payoh, Woodlands, Yishun"),
      },
      {
        name: "Foot Screening for Diabetes Patients",
        locations: polyclinics("Ang Mo Kio, Bukit Batok, Bukit Panjang, Choa Chu Kang, Clementi, Eunos, Geylang, Hougang, Jurong, Kallang, Khatib, Marine Parade, Pasir Ris, Pioneer, Punggol, Queenstown, Sembawang, Sengkang, Serangoon, Tampines, Tengah, Toa Payoh, Woodlands, Yishun"),
      },
      {
        name: "Mammogram Screening",
        locations: polyclinics("Ang Mo Kio, Bukit Batok, Bukit Panjang, Choa Chu Kang, Clementi, Eunos, Geylang, Hougang, Kallang, Khatib, Outram, Pasir Ris, Pioneer, Punggol, Sembawang, Sengkang, Serangoon, Tampines North, Tampines, Tengah, Toa Payoh, Woodlands, Yishun"),
      },
      {
        name: "Assessment for Mobility Scooter",
        locations: polyclinics("Ang Mo Kio, Geylang, Hougang, Kallang, Khatib, Sembawang, Serangoon, Toa Payoh, Woodlands, Yishun"),
      },
      {
        name: "Ultrasound",
        locations: polyclinics("Ang Mo Kio, Geylang, Hougang, Kallang, Khatib, Sembawang, Serangoon, Toa Payoh, Woodlands, Yishun"),
      },
      {
        name: "Spirometry",
        locations: polyclinics("Ang Mo Kio, Geylang, Hougang, Kallang, Khatib, Sembawang, Serangoon, Toa Payoh, Woodlands, Yishun"),
      },
    ],
  },
  {
    name: "Antenatal and Children's Health",
    types: [
      {
        name: "Antenatal Care",
        locations: polyclinics("Bukit Batok, Bukit Panjang, Choa Chu Kang, Clementi, Jurong, Pioneer, Queenstown, Tengah"),
      },
      {
        name: "Lactation Support Service",
        locations: polyclinics("Ang Mo Kio, Bukit Batok, Bukit Panjang, Choa Chu Kang, Clementi, Geylang, Hougang, Jurong, Kallang, Khatib, Pioneer, Queenstown, Sembawang, Serangoon, Tengah, Toa Payoh, Woodlands, Yishun"),
      },
      {
        name: "Newborn Jaundice Screening",
        locations: polyclinics("Ang Mo Kio, Bukit Batok, Bukit Panjang, Choa Chu Kang, Clementi, Geylang, Hougang, Jurong, Kallang, Khatib, Pioneer, Queenstown, Sembawang, Serangoon, Tengah, Toa Payoh, Woodlands, Yishun"),
      },
    ],
  },
  {
    name: "Allied Health",
    types: [
      {
        name: "Financial Counselling",
        locations: polyclinics("Ang Mo Kio, Bukit Batok, Bukit Panjang, Choa Chu Kang, Clementi, Geylang, Hougang, Jurong, Kallang, Khatib, Pioneer, Queenstown, Sembawang, Serangoon, Tengah, Toa Payoh, Woodlands, Yishun"),
      },
      {
        name: "Medical Social Service",
        locations: polyclinics("Bukit Batok, Bukit Panjang, Choa Chu Kang, Clementi, Jurong, Pioneer, Queenstown, Tengah"),
      },
      {
        name: "Physiotherapy Service",
        locations: polyclinics("Pioneer"),
      },
    ],
  },
  {
    name: "Dental",
    types: [
      {
        name: "Dental Cleaning (Scaling & Polishing)",
        locations: polyclinics("Ang Mo Kio, Bedok, Bukit Panjang, Eunos, Geylang, Hougang, Jurong, Khatib, Pasir Ris, Punggol, Queenstown, Serangoon, Tampines, Toa Payoh, Woodlands"),
      },
    ],
  },
  {
    name: "Allied Health Led Preventive Health",
    types: [
      {
        name: "Advance Care Planning",
        locations: polyclinics("Bukit Batok, Bukit Panjang, Choa Chu Kang, Clementi, Jurong, Pioneer, Queenstown, Tengah"),
      },
      {
        name: "New Weight New Me",
        locations: polyclinics("Bukit Batok, Bukit Panjang, Jurong"),
      },
    ],
  },
];
