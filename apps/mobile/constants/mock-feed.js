/** Mock community feed data — wireframe only until API Phase 1 */



import { Media } from "./media";



export const FEED_POSTS = [

  {

    id: "1",

    user: {

      name: "Jessica Miller",

      avatar: Media.avatarJessica,

      time: "2h ago",

      location: "Building A",

    },

    content: "Does anyone know a good pediatrician nearby?",

    tag: "Recommendation",

    likes: 12,

    comments: 8,

  },

  {

    id: "2",

    user: {

      name: "Marcus Chen",

      avatar: Media.avatarMarcus,

      time: "5h ago",

      location: "Building C",

    },

    content: "Free moving boxes available in the lobby — first come first served!",

    tag: "For Sale",

    likes: 24,

    comments: 3,

  },

  {

    id: "3",

    user: {

      name: "Sarah Johnson",

      avatar: Media.avatarSarah,

      time: "1d ago",

      location: "Building B",

    },

    content: "Looking for a dog walker for weekday mornings. Any recommendations?",

    tag: "Help",

    likes: 9,

    comments: 14,

  },

];



export const FEED_COMMENTS = {

  1: [

    { id: "c1", user: "David Park", time: "1h ago", body: "Dr. Rivera on Oak St is great with kids." },

    { id: "c2", user: "Amy Lopez", time: "45m ago", body: "Second Dr. Rivera — we've been going for years." },

    { id: "c3", user: "Jessica Miller", time: "30m ago", body: "Thank you both! I'll check them out." },

  ],

  2: [

    { id: "c4", user: "Tom Reed", time: "3h ago", body: "Are they still there?" },

    { id: "c5", user: "Marcus Chen", time: "2h ago", body: "Yes, about 15 boxes left in the lobby." },

  ],

  3: [

    { id: "c6", user: "Lisa Wong", time: "20h ago", body: "Happy Paws does weekday walks — very reliable." },

  ],

};



export const FEED_TOPICS = [

  "Recommendations",

  "Events",

  "For Sale",

  "Help",

  "Pets",

  "Wellness",

  "Neighborhood",

];

