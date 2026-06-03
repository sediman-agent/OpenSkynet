import { useState } from 'react';
import { Download, Trash2, Search, Package } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { Input } from '@/components/shared/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/shared/Card';
import { ScrollArea } from '@/components/shared/ScrollArea';
import { type Skill } from '@/types';

// Mock skills data - will be replaced with RPC calls
const mockSkills: Skill[] = [
  {
    id: '1',
    name: 'web-search',
    description: 'Search the web for information',
    version: '1.0.0',
    author: 'Sediman',
    installed: true,
    tags: ['search', 'web'],
  },
  {
    id: '2',
    name: 'browser-automation',
    description: 'Automate browser interactions',
    version: '1.2.0',
    author: 'Sediman',
    installed: true,
    tags: ['browser', 'automation'],
  },
  {
    id: '3',
    name: 'data-extraction',
    description: 'Extract structured data from web pages',
    version: '0.9.0',
    author: 'Community',
    installed: false,
    tags: ['extraction', 'data'],
  },
];

export function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>(mockSkills);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'installed' | 'available'>('all');

  const filteredSkills = skills.filter((skill) => {
    const matchesSearch =
      skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.description.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesFilter =
      filter === 'all' ||
      (filter === 'installed' && skill.installed) ||
      (filter === 'available' && !skill.installed);

    return matchesSearch && matchesFilter;
  });

  const handleInstall = (skillId: string) => {
    setSkills((prev) =>
      prev.map((skill) =>
        skill.id === skillId ? { ...skill, installed: true } : skill
      )
    );
  };

  const handleUninstall = (skillId: string) => {
    setSkills((prev) =>
      prev.map((skill) =>
        skill.id === skillId ? { ...skill, installed: false } : skill
      )
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-14 border-b border-border flex items-center justify-between px-4">
        <h2 className="text-lg font-semibold">Skills</h2>
      </div>

      {/* Search & Filter */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search skills..."
            className="pl-9"
          />
        </div>

        <div className="flex gap-2">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
          >
            All ({skills.length})
          </Button>
          <Button
            variant={filter === 'installed' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('installed')}
          >
            Installed ({skills.filter((s) => s.installed).length})
          </Button>
          <Button
            variant={filter === 'available' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('available')}
          >
            Available ({skills.filter((s) => !s.installed).length})
          </Button>
        </div>
      </div>

      {/* Skills Grid */}
      <ScrollArea className="flex-1 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSkills.map((skill) => (
            <Card key={skill.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base">{skill.name}</CardTitle>
                  </div>
                  <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded">
                    {skill.version}
                  </span>
                </div>
                <CardDescription>{skill.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-1">
                    {skill.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs bg-muted px-2 py-0.5 rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  {skill.author && (
                    <p className="text-xs text-muted-foreground">
                      by {skill.author}
                    </p>
                  )}

                  <Button
                    variant={skill.installed ? 'outline' : 'default'}
                    size="sm"
                    className="w-full"
                    onClick={() =>
                      skill.installed
                        ? handleUninstall(skill.id)
                        : handleInstall(skill.id)
                    }
                  >
                    {skill.installed ? (
                      <>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Uninstall
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4 mr-2" />
                        Install
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredSkills.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No skills found matching your criteria
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
