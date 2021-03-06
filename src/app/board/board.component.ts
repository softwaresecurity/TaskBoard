import { Component, OnInit, OnDestroy, AfterContentInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Title } from '@angular/platform-browser';

import { DragulaService } from 'ng2-dragula/dist';

import {
  ApiResponse,
  Board,
  Column,
  Task,
  User,
  Notification,
} from '../shared/models';
import {
  AuthService,
  ContextMenuService,
  NotificationsService,
  StringsService
} from '../shared/services';
import { BoardService } from './board.service';

@Component({
  selector: 'tb-board',
  templateUrl: './board.component.html'
})
export class BoardDisplay implements OnInit, OnDestroy, AfterContentInit {
  private strings: any;
  private noBoardsMessage: string;
  private subs: Array<any>;

  private hideFiltered: boolean;
  private everyOtherDrop: boolean;

  public categoryFilter: number;
  public userFilter: number;
  public boardNavId: number;

  public activeUser: User;
  public activeBoard: Board;
  public boards: Array<Board>;
  public pageName: string;

  public loading: boolean;

  constructor(public title: Title,
              private router: Router,
              private active: ActivatedRoute,
              public auth: AuthService,
              public boardService: BoardService,
              private menuService: ContextMenuService,
              private notes: NotificationsService,
              private stringsService: StringsService,
              public dragula: DragulaService) {
    title.setTitle('TaskBoard - Kanban App');

    this.boardNavId = null;
    this.userFilter = null;
    this.categoryFilter = null;

    this.activeBoard = new Board();
    this.activeUser = new User();

    this.boards = [];
    this.subs = [];

    this.loading = true;
    this.hideFiltered = false;

    let sub = stringsService.stringsChanged.subscribe(newStrings => {
      this.strings = newStrings;

      // Updating the active user updates some display strings.
      this.updateActiveUser(this.activeUser);
    });
    this.subs.push(sub);

    this.pageName = this.strings.boards;

    this.updateBoards();

    sub = boardService.activeBoardChanged.subscribe((board: Board) => {
      if (!board) {
        return;
      }

      this.activeBoard = board;
      title.setTitle('TaskBoard - ' + board.name);
      this.userFilter = null;
      this.categoryFilter = null;
    });
    this.subs.push(sub);

    sub = auth.userChanged.subscribe((user: User) => {
      this.updateActiveUser(user);
    });
    this.subs.push(sub);

    sub = active.params.subscribe(params => {
      let id = +params.id;

      this.boardNavId = id ? id : null;
      this.updateActiveBoard();
    });
    this.subs.push(sub);
  }

  ngOnInit() {
    if (this.boardNavId) {
      return;
    }

    if (this.activeUser && this.activeUser.default_board_id) {
      this.boardNavId = this.activeUser.default_board_id;
      this.goToBoard();
    }
  }

  ngOnDestroy() {
    this.subs.forEach(sub => sub.unsubscribe());
  }

  ngAfterContentInit() {
    let bag = this.dragula.find('tasks-bag');

    if (bag) {
      this.dragula.destroy('tasks-bag');
    }

    this.dragula.createGroup('tasks-bag', <any>{
      moves: (el: any, container: any, handle: any) => {
        return handle.classList.contains('drag-handle');
      }
    });

    this.dragula.dropModel('tasks-bag').subscribe((value: any) => {
      let taskId = +value[1].id,
        toColumnId = +value[2].parentNode.id,
        fromColumnId = +value[3].parentNode.id;

      if (toColumnId !== fromColumnId) {
        this.changeTaskColumn(taskId, toColumnId);
        return;
      }

      this.everyOtherDrop = !this.everyOtherDrop;
      if (this.everyOtherDrop) {
        for (var i = 0, len = this.activeBoard.columns.length; i < len; ++i) {
          let column = this.activeBoard.columns[i];

          if (column.id === toColumnId) {
            let pos = 0;
            this.activeBoard.columns[i].tasks.forEach(task => {
              task.position = pos;
              pos++;
            });
            this.boardService.updateColumn(column).subscribe();
            break;
          }
        }
      }
    });
  }

  goToBoard(): void {
    if (this.boardNavId === null) {
      return;
    }

    this.router.navigate(['/boards/' + this.boardNavId]);
  }

  toggleFiltered() {
    this.activeBoard.columns.forEach(column => {
      column.tasks.forEach(task => {
        task.hideFiltered = this.hideFiltered;
      });
    });
  }

  filterTasks() {
    this.activeBoard.columns.forEach(column => {
      column.tasks.forEach(task => {
        task.filtered = false;

        if (this.userFilter) {
          let found = false;

          if (this.userFilter === -1 &&
            task.assignees.length === 0) {
            found = true;
          }

          task.assignees.forEach(user => {
            if (user.id === this.userFilter) {
              found = true;
            }
          });

          if (!found) {
            task.filtered = true;
          }
        }

        if (this.categoryFilter) {
          let found = false;

          if (this.categoryFilter === -1 &&
            task.categories.length === 0) {
            found = true;
          }

          task.categories.forEach(cat => {
            if (cat.id === this.categoryFilter) {
              found = true;
            }
          });

          if (!found) {
            task.filtered = true;
          }
        }
      });
    });
  }

  private updateBoards(): void {
    this.boardService.getBoards().subscribe((response: ApiResponse) => {
      this.boards = [];
      if (response.data.length > 1) {
        this.updateBoardsList(response.data[1]);
      }
      this.loading = false;
    });
  }

  private updateBoardsList(boards: Array<any>): void {
    let activeBoards: Array<Board> = [];

    if (boards) {
      boards.forEach((board: any) => {
        let currentBoard = new Board(+board.id, board.name,
                                     board.is_active === '1',
                                     board.ownColumn,
                                     board.ownCategory,
                                     board.ownAutoAction,
                                     board.ownIssuetracker,
                                     board.sharedUser);
        if (currentBoard.is_active) {
          activeBoards.push(currentBoard);
        }
      });
    }

    this.boards = activeBoards;

    this.boards.forEach(board => {
      board.columns.sort((a: Column, b: Column) => {
        return +a.position - +b.position;
      });
    });

    this.updateActiveBoard();
  }

  private updateActiveBoard(): void {
    if (!this.boardNavId || !this.boards) {
      this.activeBoard = null;
      return;
    }

    this.boards.forEach(board => {
      if (board.id === this.boardNavId) {
        this.activeBoard = board;
        this.boardService.updateActiveBoard(board);
        this.pageName = board.name;
      }
    });
  }

  private updateActiveUser(activeUser: User) {
    if (!activeUser) {
      return;
    }

    this.activeUser = new User(+activeUser.default_board_id,
                               activeUser.email,
                               +activeUser.id,
                               activeUser.last_login,
                               +activeUser.security_level,
                               +activeUser.user_option_id,
                               activeUser.username,
                               activeUser.board_access);

    this.noBoardsMessage = this.strings.boards_noBoardsMessageUser;

    if (+activeUser.security_level === 1) {
      this.noBoardsMessage = this.strings.boards_noBoardsMessageAdmin;
    }
  }

  private changeTaskColumn(taskId: number, toColumnId: number) {
    let column = this.activeBoard.columns
      .find(col => col.id === toColumnId);
    let task = column.tasks.find(ta => ta.id === taskId);

    if (task) {
      task.column_id = toColumnId;

      this.boardService.updateTask(task).subscribe();
    }
  }

}

