import express from 'express';
import minimist from 'minimist';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
    getDrugByNDC,
    getHealthIndicators,
    searchDrugs,
    searchPubMedArticles,
    searchRxNormDrugs,
    searchGoogleScholar,
    getPubMedArticleByPMID,
    searchClinicalGuidelines,
    checkDrugInteractions,
    searchMedicalDatabases,
    searchMedicalJournals,
    createErrorResponse,
    formatDrugSearchResults,
    formatDrugDetails,
    formatHealthIndicators,
    formatPubMedArticles,
    formatGoogleScholarArticles,
    formatDrugInteractions,
    formatMedicalDatabasesSearch,
    formatMedicalJournalsSearch,
    formatArticleDetails,
    formatRxNormDrugs,
    formatClinicalGuidelines,
    logSafetyWarnings,
} from './utils.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

// 요청마다 독립된 MCP 서버 인스턴스를 만들기 위한 팩토리 (stateless Streamable HTTP)
function createServer(): McpServer {
    const server = new McpServer({
        name: 'medical-mcp',
        version: '1.0.0',
        capabilities: {
            resources: {},
            tools: {},
        },
    });

    // MCP Tools
    server.tool(
        'search-drugs',
        'Search for drug information using FDA database',
        {
            query: z.string().describe('Drug name to search for (brand name or generic name)'),
            limit: z.number().int().min(1).max(50).optional().default(10).describe('Number of results to return (max 50)'),
        },
        async ({ query, limit }) => {
            try {
                const drugs = await searchDrugs(query, limit);
                return formatDrugSearchResults(drugs, query);
            } catch (error: any) {
                return createErrorResponse('searching drugs', error);
            }
        }
    );

    server.tool(
        'get-drug-details',
        'Get detailed information about a specific drug by NDC (National Drug Code)',
        {
            ndc: z.string().describe('National Drug Code (NDC) of the drug'),
        },
        async ({ ndc }) => {
            try {
                const drug = await getDrugByNDC(ndc);
                return formatDrugDetails(drug, ndc);
            } catch (error: any) {
                return createErrorResponse('fetching drug details', error);
            }
        }
    );

    server.tool(
        'get-health-statistics',
        'Get health statistics and indicators from WHO Global Health Observatory',
        {
            indicator: z.string().describe("Health indicator to search for (e.g., 'Life expectancy', 'Mortality rate')"),
            country: z.string().optional().describe("Country code (e.g., 'USA', 'GBR') - optional"),
            limit: z.number().int().min(1).max(20).optional().default(10).describe('Number of results to return (max 20)'),
        },
        async ({ indicator, country, limit }) => {
            try {
                const indicators = await getHealthIndicators(indicator, country);
                return formatHealthIndicators(indicators, indicator, country, limit);
            } catch (error: any) {
                return createErrorResponse('fetching health statistics', error);
            }
        }
    );

    server.tool(
        'search-medical-literature',
        'Search for medical research articles in PubMed',
        {
            query: z.string().describe('Medical topic or condition to search for'),
            max_results: z
                .number()
                .int()
                .min(1)
                .max(20)
                .optional()
                .default(10)
                .describe('Maximum number of articles to return (max 20)'),
        },
        async ({ query, max_results }) => {
            try {
                const articles = await searchPubMedArticles(query, max_results);
                return formatPubMedArticles(articles, query);
            } catch (error: any) {
                return createErrorResponse('searching medical literature', error);
            }
        }
    );

    server.tool(
        'get-article-details',
        'Get detailed information about a specific medical article by PMID',
        {
            pmid: z.string().describe('PubMed ID (PMID) of the article'),
        },
        async ({ pmid }) => {
            try {
                const article = await getPubMedArticleByPMID(pmid);
                return formatArticleDetails(article, pmid);
            } catch (error: any) {
                return createErrorResponse('fetching article details', error);
            }
        }
    );

    server.tool(
        'search-drug-nomenclature',
        'Search for drug information using RxNorm (standardized drug nomenclature)',
        {
            query: z.string().describe('Drug name to search for in RxNorm database'),
        },
        async ({ query }) => {
            try {
                const drugs = await searchRxNormDrugs(query);
                return formatRxNormDrugs(drugs, query);
            } catch (error: any) {
                return createErrorResponse('searching RxNorm', error);
            }
        }
    );

    server.tool(
        'search-google-scholar',
        'Search for academic research articles using Google Scholar',
        {
            query: z.string().describe('Academic topic or research query to search for'),
        },
        async ({ query }) => {
            try {
                const articles = await searchGoogleScholar(query);
                return formatGoogleScholarArticles(articles, query);
            } catch (error: any) {
                return createErrorResponse('searching Google Scholar', error);
            }
        }
    );

    server.tool(
        'search-clinical-guidelines',
        'Search for clinical guidelines and practice recommendations from medical organizations',
        {
            query: z.string().describe('Medical condition or topic to search for guidelines'),
            organization: z
                .string()
                .optional()
                .describe("Specific medical organization to filter by (e.g., 'American Heart Association', 'WHO')"),
        },
        async ({ query, organization }) => {
            try {
                const guidelines = await searchClinicalGuidelines(query, organization);
                return formatClinicalGuidelines(guidelines, query, organization);
            } catch (error: any) {
                return createErrorResponse('searching clinical guidelines', error);
            }
        }
    );

    server.tool(
        'check-drug-interactions',
        'Check for potential drug-drug interactions between two medications',
        {
            drug1: z.string().describe('First drug name'),
            drug2: z.string().describe('Second drug name'),
        },
        async ({ drug1, drug2 }) => {
            try {
                const interactions = await checkDrugInteractions(drug1, drug2);
                return formatDrugInteractions(interactions, drug1, drug2);
            } catch (error: any) {
                return createErrorResponse('checking drug interactions', error);
            }
        }
    );

    // Enhanced Medical Database Search Tool
    server.tool(
        'search-medical-databases',
        'Search across multiple medical databases (PubMed, Google Scholar, Cochrane, ClinicalTrials.gov) for comprehensive results',
        {
            query: z.string().describe('Medical topic or condition to search for across multiple databases'),
        },
        async ({ query }) => {
            try {
                const articles = await searchMedicalDatabases(query);
                return formatMedicalDatabasesSearch(articles, query);
            } catch (error: any) {
                return createErrorResponse('searching medical databases', error);
            }
        }
    );

    // Enhanced Medical Journal Search Tool
    server.tool(
        'search-medical-journals',
        'Search specific medical journals (NEJM, JAMA, Lancet, BMJ, Nature Medicine) for high-quality research',
        {
            query: z.string().describe('Medical topic or condition to search for in top medical journals'),
        },
        async ({ query }) => {
            try {
                const articles = await searchMedicalJournals(query);
                return formatMedicalJournalsSearch(articles, query);
            } catch (error: any) {
                return createErrorResponse('searching medical journals', error);
            }
        }
    );

    return server;
}

logSafetyWarnings();

async function startHttpServer(port: number) {
    const app = express();
    app.use(express.json());

    // MCP Streamable HTTP 엔드포인트 (stateless)
    // - 요청마다 새 서버/트랜스포트를 만들어 요청 간 상태·ID 충돌을 막음
    // - 클라이언트는 tools/list 로 등록된 tool 목록·스키마를 자동으로 받아감
    app.post('/mcp', async (req, res) => {
        const server = createServer();
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

        res.on('close', () => {
            transport.close();
            server.close();
        });

        try {
            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);
        } catch (error) {
            console.error('MCP request error:', error);
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: '2.0',
                    error: { code: -32603, message: 'Internal server error' },
                    id: null,
                });
            }
        }
    });

    // stateless 모드에서는 SSE 스트림(GET)·세션 종료(DELETE)를 지원하지 않음
    const methodNotAllowed = (_req: express.Request, res: express.Response) => {
        res.status(405).json({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Method not allowed.' },
            id: null,
        });
    };
    app.get('/mcp', methodNotAllowed);
    app.delete('/mcp', methodNotAllowed);

    // 헬스체크
    app.get('/health', (_req, res) => {
        res.json({ status: 'ok' });
    });

    const HOST = '0.0.0.0';
    app.listen(port, HOST, () => {
        console.error(`🌐 Medical MCP server (Streamable HTTP) running at http://${HOST}:${port}/mcp`);
    });
}

async function main() {
    const args = minimist(process.argv.slice(2));

    // HTTP 모드 (Streamable HTTP transport)
    if (args.http) {
        console.error('🌐 Starting HTTP mode...');
        await startHttpServer(Number(args.port) || 3000);
        return;
    }

    // STDIO 모드
    // stdout 은 JSON-RPC 메시지 전용이므로 로그는 반드시 stderr(console.error)로 출력
    console.error('🔌 Starting STDIO mode...');
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('✅ Medical MCP Server running on stdio');
}

main().catch((err) => console.error(err));
