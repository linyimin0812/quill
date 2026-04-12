import { Controller, Get, Post, Body } from '@nestjs/common';
import { SearchService } from './search.service.js';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Post('query')
  async search(@Body() dto: { query: string }) {
    return this.searchService.search(dto.query);
  }

  @Get('index')
  async getIndexStatus() {
    return this.searchService.rebuildIndex();
  }

  @Post('index')
  async addToIndex(@Body() dto: { path: string; title: string; content: string }) {
    return this.searchService.addToIndex(dto.path, dto.title, dto.content);
  }
}
