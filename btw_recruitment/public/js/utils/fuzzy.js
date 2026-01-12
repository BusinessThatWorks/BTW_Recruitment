// window.FuzzyUtils = (function () {

//     function normalize(text) {
//         return (text || "")
//             .toString()
//             .toLowerCase()
//             .trim();
//     }

//     // Simple subsequence-based fuzzy match
//     function isFuzzyMatch(query, text) {
//         query = normalize(query);
//         text = normalize(text);

//         if (!query) return true;

//         let qIndex = 0;

//         for (let i = 0; i < text.length; i++) {
//             if (text[i] === query[qIndex]) {
//                 qIndex++;
//             }
//             if (qIndex === query.length) {
//                 return true;
//             }
//         }
//         return false;
//     }

//     // Filter array of objects
//     function filterList(data, query, keys = []) {
//         if (!query) return data;

//         return data.filter(item => {
//             return keys.some(key =>
//                 isFuzzyMatch(query, item[key])
//             );
//         });
//     }

//     return {
//         isFuzzyMatch,
//         filterList
//     };

// })();
// Simple fuzzy match: checks if query characters appear in order in word

function fuzzyMatchWords(query, words) {
    console.log("🔍 fuzzyMatchWords called with:", { query, words });
    
    if (!query || !Array.isArray(words)) {
        console.log("❌ Early return - invalid input");
        return words || [];
    }

    query = query.toLowerCase().trim();
    console.log("📝 Normalized query:", query);

    const results = words.filter(word => {
        if (!word) {
            console.log("  ❌ Skipped null/undefined word");
            return false;
        }

        word = String(word).toLowerCase();
        console.log(`  📍 Checking word: "${word}"`);

        if (word.length < query.length) {
            console.log(`    ❌ Word too short (${word.length} < ${query.length})`);
            return false;
        }

        let qi = 0;

        for (let wi = 0; wi < word.length && qi < query.length; wi++) {
            if (word[wi] === query[qi]) {
                console.log(`    ✅ Matched "${query[qi]}" at position ${wi}`);
                qi++;
            }
        }

        const matched = qi === query.length;
        console.log(`    ${matched ? "✅ MATCH" : "❌ NO MATCH"} (matched ${qi}/${query.length} chars)`);
        return matched;
    });

    console.log("✨ Final results:", results);
    return results;
}

// expose globally (so dashboards can use it)
window.FuzzyUtils = {
    fuzzyMatchWords
};

