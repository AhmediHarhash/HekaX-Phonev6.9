// ============================================================================
// HEKAX Phone - AI Training Service
// Custom AI training with FAQs, scripts, and knowledge base
// ============================================================================

const prisma = require("../lib/prisma");

/**
 * Get all training data for an organization
 */
async function getTrainingData(organizationId) {
  const [faqs, scripts, responses, knowledgeBase] = await Promise.all([
    prisma.aIFAQ.findMany({
      where: { organizationId },
      orderBy: { priority: "desc" },
    }),
    prisma.aIScript.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
    }),
    prisma.aICustomResponse.findMany({
      where: { organizationId },
      orderBy: { triggerPhrase: "asc" },
    }),
    prisma.aIKnowledgeBase.findMany({
      where: { organizationId },
      orderBy: { category: "asc" },
    }),
  ]);

  return { faqs, scripts, responses, knowledgeBase };
}

/**
 * Create or update an FAQ
 */
async function saveFAQ(organizationId, data) {
  const { id, question, answer, category, priority, keywords } = data;

  if (id) {
    return prisma.aIFAQ.update({
      where: { id, organizationId },
      data: { question, answer, category, priority, keywords },
    });
  }

  return prisma.aIFAQ.create({
    data: {
      organizationId,
      question,
      answer,
      category,
      priority: priority || 0,
      keywords: keywords || [],
    },
  });
}

/**
 * Delete an FAQ
 */
async function deleteFAQ(id, organizationId) {
  return prisma.aIFAQ.delete({
    where: { id, organizationId },
  });
}

/**
 * Create or update a script
 */
async function saveScript(organizationId, data) {
  const { id, name, description, scenario, script, isActive } = data;

  if (id) {
    return prisma.aIScript.update({
      where: { id, organizationId },
      data: { name, description, scenario, script, isActive },
    });
  }

  return prisma.aIScript.create({
    data: {
      organizationId,
      name,
      description,
      scenario,
      script,
      isActive: isActive !== false,
    },
  });
}

/**
 * Delete a script
 */
async function deleteScript(id, organizationId) {
  return prisma.aIScript.delete({
    where: { id, organizationId },
  });
}

/**
 * Create or update a custom response
 */
async function saveCustomResponse(organizationId, data) {
  const { id, triggerPhrase, response, matchType, isActive } = data;

  if (id) {
    return prisma.aICustomResponse.update({
      where: { id, organizationId },
      data: { triggerPhrase, response, matchType, isActive },
    });
  }

  return prisma.aICustomResponse.create({
    data: {
      organizationId,
      triggerPhrase,
      response,
      matchType: matchType || "contains",
      isActive: isActive !== false,
    },
  });
}

/**
 * Delete a custom response
 */
async function deleteCustomResponse(id, organizationId) {
  return prisma.aICustomResponse.delete({
    where: { id, organizationId },
  });
}

/**
 * Add knowledge base entry
 */
async function addKnowledgeEntry(organizationId, data) {
  const { title, content, category, source, sourceUrl } = data;

  return prisma.aIKnowledgeBase.create({
    data: {
      organizationId,
      title,
      content,
      category,
      source,
      sourceUrl,
    },
  });
}

/**
 * Update knowledge base entry
 */
async function updateKnowledgeEntry(id, organizationId, data) {
  return prisma.aIKnowledgeBase.update({
    where: { id, organizationId },
    data,
  });
}

/**
 * Delete knowledge base entry
 */
async function deleteKnowledgeEntry(id, organizationId) {
  return prisma.aIKnowledgeBase.delete({
    where: { id, organizationId },
  });
}

/**
 * Bulk import FAQs from JSON/CSV
 */
async function bulkImportFAQs(organizationId, faqs) {
  const results = {
    imported: 0,
    skipped: 0,
    errors: [],
  };

  for (const faq of faqs) {
    try {
      if (!faq.question || !faq.answer) {
        results.skipped++;
        continue;
      }

      await prisma.aIFAQ.create({
        data: {
          organizationId,
          question: faq.question,
          answer: faq.answer,
          category: faq.category || "general",
          priority: faq.priority || 0,
          keywords: faq.keywords || [],
        },
      });
      results.imported++;
    } catch (err) {
      results.errors.push({
        question: faq.question?.substring(0, 50),
        error: err.message,
      });
    }
  }

  return results;
}

/**
 * Generate system prompt from training data
 */
async function generateSystemPrompt(organizationId) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      name: true,
      industry: true,
      systemPrompt: true,
      personality: true,
    },
  });

  const [faqs, scripts, responses, knowledge] = await Promise.all([
    prisma.aIFAQ.findMany({
      where: { organizationId },
      orderBy: { priority: "desc" },
      take: 50,
    }),
    prisma.aIScript.findMany({
      where: { organizationId, isActive: true },
      take: 10,
    }),
    prisma.aICustomResponse.findMany({
      where: { organizationId, isActive: true },
    }),
    prisma.aIKnowledgeBase.findMany({
      where: { organizationId },
      take: 20,
    }),
  ]);

  let prompt = org.systemPrompt || "";

  // Add FAQs
  if (faqs.length > 0) {
    prompt += "\n\n## Frequently Asked Questions\n";
    prompt += "Use these Q&As to answer common questions:\n\n";
    faqs.forEach((faq) => {
      prompt += `Q: ${faq.question}\nA: ${faq.answer}\n\n`;
    });
  }

  // Add scripts for scenarios
  if (scripts.length > 0) {
    prompt += "\n\n## Scenario Scripts\n";
    scripts.forEach((script) => {
      prompt += `\n### ${script.name}\n`;
      if (script.description) prompt += `${script.description}\n`;
      prompt += `When: ${script.scenario}\n`;
      prompt += `Response: ${script.script}\n`;
    });
  }

  // Add custom responses
  if (responses.length > 0) {
    prompt += "\n\n## Custom Responses\n";
    prompt += "Use these exact responses when matching phrases are detected:\n\n";
    responses.forEach((r) => {
      prompt += `- If caller says "${r.triggerPhrase}", respond with: "${r.response}"\n`;
    });
  }

  // Add knowledge base
  if (knowledge.length > 0) {
    prompt += "\n\n## Knowledge Base\n";
    prompt += "Reference this information when relevant:\n\n";
    knowledge.forEach((k) => {
      prompt += `### ${k.title}\n${k.content}\n\n`;
    });
  }

  return prompt;
}

/**
 * Get training statistics
 */
async function getTrainingStats(organizationId) {
  const [faqCount, scriptCount, responseCount, knowledgeCount] = await Promise.all([
    prisma.aIFAQ.count({ where: { organizationId } }),
    prisma.aIScript.count({ where: { organizationId } }),
    prisma.aICustomResponse.count({ where: { organizationId } }),
    prisma.aIKnowledgeBase.count({ where: { organizationId } }),
  ]);

  return {
    faqs: faqCount,
    scripts: scriptCount,
    customResponses: responseCount,
    knowledgeEntries: knowledgeCount,
    totalEntries: faqCount + scriptCount + responseCount + knowledgeCount,
  };
}

module.exports = {
  getTrainingData,
  saveFAQ,
  deleteFAQ,
  saveScript,
  deleteScript,
  saveCustomResponse,
  deleteCustomResponse,
  addKnowledgeEntry,
  updateKnowledgeEntry,
  deleteKnowledgeEntry,
  bulkImportFAQs,
  generateSystemPrompt,
  getTrainingStats,
};
