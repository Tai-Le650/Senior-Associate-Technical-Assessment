/**
 * Single source of truth for the AI helper widget.
 * Each fact-bearing field ships with a `source` string so the response generator can cite it.
 */
window.PROFILE = {
  name: "Tai Le",
  pronoun: "they",
  title: "4th-year Computer Science & Engineering student at UC Merced",
  email: "taile650@gmail.com",
  emailSchool: "tle271@ucmerced.edu",
  phone: "(650) 283-9427",
  blurb: {
    text: "Builds simulations, full-stack tools, and small games — ships rough, then sands the edges until they feel intentional.",
    source: "portfolio.html#about"
  },
  education: {
    school: "University of California, Merced",
    degree: "B.S. Computer Science & Engineering",
    dates: "Aug. 2022 – Expected Dec. 2026",
    coursework: ["Data Structures", "Computer Organization", "Networking", "Assembly", "Algorithms"],
    source: "Resume.pdf"
  },
  skills: {
    languages: {
      values: ["C++", "Python", "C#", "JavaScript", "SQL", "HTML/CSS", "MIPS Assembly", "GDScript"],
      source: "Resume.pdf"
    },
    apis: {
      values: ["Gemini", "OpenRouter", "ElevenLabs", "Open-Meteo", "NASA APIs", "GBIF"],
      source: "Resume.pdf"
    },
    tools: {
      values: ["Figma", "Git", "VS Code", "RARS", "Docker"],
      source: "Resume.pdf"
    },
    engines: {
      values: ["Godot", "Unity", "Node.js"],
      source: "Resume.pdf"
    },
    concepts: {
      values: ["Object-Oriented Programming", "Full-Stack Web Development", "Debugging", "Networking Protocols", "System Architecture"],
      source: "Resume.pdf"
    },
    soft: {
      values: ["end-to-end ownership", "detail-oriented", "fast iteration"],
      source: "portfolio.html#about"
    }
  },
  experience: [
    {
      employer: "Le Architecture",
      role: "Networking Infrastructure Deployment",
      dates: "—",
      summary: "Wired the office with CAT6 Ethernet to a central server, configured each workstation for office or remote use via Dropbox, and installed an Eero mesh Wi-Fi system for reliable coverage.",
      source: "Resume.pdf"
    }
  ],
  projects: [
    {
      name: "LLNL Capstone — AI for STEM Education",
      year: 2025,
      stack: ["Godot", "GDScript", "C++", "JavaScript", "GDShader", "Node.js"],
      tags: ["AI", "education", "simulation", "full-stack"],
      summary: "Senior capstone with Dr. Rakestraw at Lawrence Livermore National Laboratory — researching how AI, LLMs, and APIs can help high-school and undergraduate students learn STEM topics through interactive games.",
      collaborators: ["Dr. Rakestraw (LLNL)"],
      url: "portfolio.html#work",
      source: "Resume.pdf"
    },
    {
      name: "EcoBuilder Simulation Game",
      year: 2025,
      stack: ["Godot", "GDScript", "C++", "JavaScript", "GDShader", "Node.js"],
      tags: ["simulation", "agent-based", "AI", "audio"],
      summary: "Interactive 3D ecosystem simulating predator–prey dynamics across 7 animals and 5 plant species, with live Open-Meteo and GBIF data for a realistic global environment. Includes a secure Node.js backend for API-key handling, a voice-responsive AI helper (OpenRouter + ElevenLabs), and a custom C++ GDExtension using Miniaudio for audio input.",
      url: "portfolio.html#work",
      source: "Resume.pdf"
    }
  ],
  links: {
    portfolio: "portfolio.html",
    resume:    "resume.html",
    pdf:       "Resume.pdf",
    github:    "https://github.com/Tai-Le650",
    linkedin:  "https://linkedin.com/in/650-tai-le",
    mailto:    "mailto:taile650@gmail.com"
  },
  /**
   * Keyword weights for role-fit scoring. Tokens are matched against the union of all
   * skills.* values plus project tags/stacks. Tokens are case-insensitive.
   */
  roleKeywords: {
    "frontend":         ["JavaScript", "HTML/CSS", "Figma", "interactive", "web"],
    "backend":          ["Node.js", "C++", "Python", "SQL", "Networking Protocols", "System Architecture"],
    "full-stack":       ["JavaScript", "Node.js", "HTML/CSS", "SQL", "Full-Stack Web Development"],
    "game dev":         ["Godot", "Unity", "GDScript", "C#", "C++", "GDShader", "simulation"],
    "swe intern":       ["C++", "Python", "JavaScript", "Git", "Object-Oriented Programming", "Debugging"],
    "research":         ["Python", "simulation", "agent-based", "AI", "education"],
    "ai/ml":            ["Python", "Gemini", "OpenRouter", "AI", "agent-based"],
    "ai engineer":      ["Python", "Gemini", "OpenRouter", "ElevenLabs", "AI", "full-stack"],
    "systems":          ["C++", "C#", "MIPS Assembly", "Computer Organization", "System Architecture", "Networking"],
    "data":             ["Python", "SQL", "Open-Meteo", "NASA APIs", "GBIF"],
    "devops":           ["Docker", "Git", "Networking", "Node.js"],
    "infrastructure":   ["Networking", "Docker", "System Architecture", "Networking Protocols"]
  }
};
